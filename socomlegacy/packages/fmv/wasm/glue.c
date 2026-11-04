/*
 * glue.c -- the WebAssembly face of libmpeg2 0.5.1: PLAT-19a's spike (web research 98 section 7), the page's decoder
 * since PLAT-19b (web research 120 section 2).
 * GPL-2.0-or-later, as the library it links (COPYING beside this file).
 *
 * libmpeg2's own state machine (doc/libmpeg2.txt, doc/sample1.c), nothing added: the caller writes stream bytes into
 * the glue's input buffer and feeds them; `s2u_fmv_next` runs mpeg2_parse until a picture is ready for display (1),
 * more bytes are needed (0) or the decoder reports a broken stream (-1, counted). A displayed picture is the decoder's
 * own frame buffer -- three planes, Y then Cb then Cr, no conversion -- valid until the next call to `s2u_fmv_next`.
 * Pictures come out in display order; the glue numbers them 0, 1, 2 ... as they come.
 *
 * Usage (one stream):
 *   h = s2u_fmv_open();
 *   loop: while ((r = s2u_fmv_next(h)) == 1) read the picture;
 *         if bytes remain: p = s2u_fmv_buffer(h, n); if (!p) stop (no memory); copy n bytes to p; s2u_fmv_feed(h, n);
 *         else: s2u_fmv_flush(h); drain s2u_fmv_next until 0; stop.
 *   s2u_fmv_reset(h) for the next stream on the same handle (a second movie); s2u_fmv_close(h).
 *
 * To know which coded picture each displayed picture is, feed one coded picture per call, starting at its picture
 * start code, with s2u_fmv_feed_tagged(h, n, k): libmpeg2 attaches k to the next picture whose start code follows
 * (mpeg2_tag_picture, doc/libmpeg2.txt), and s2u_fmv_tag / s2u_fmv_tagged give it back on the displayed picture.
 */
#include <inttypes.h>
#include <stdlib.h>
#include <string.h>

#include "mpeg2.h"

#define EXPORT __attribute__((used, visibility("default")))

typedef struct {
    mpeg2dec_t * dec;
    const mpeg2_info_t * info;
    uint8_t * in;            /* the input buffer the caller fills; libmpeg2 reads it in place */
    unsigned in_size;
    int ended;               /* a sequence_end_code was decoded (STATE_END) and nothing has been decoded since */
    int flushed;             /* s2u_fmv_flush fed its end code and no bytes have been fed since */
    int invalid;             /* STATE_INVALID / STATE_INVALID_END seen after the first sequence header */
    int seen_sequence;
    /* the picture last returned by s2u_fmv_next */
    int index;               /* display-order number, -1 before the first */
    uint8_t * planes[3];
    uint32_t flags;
    unsigned temporal_reference;
    unsigned nb_fields;
    uint32_t tag;            /* the displayed picture's tag (s2u_fmv_feed_tagged), valid when tagged */
    int tagged;
} s2u_fmv_t;

EXPORT s2u_fmv_t * s2u_fmv_open (void)
{
    s2u_fmv_t * h = (s2u_fmv_t *) calloc (1, sizeof (s2u_fmv_t));
    if (!h)
        return NULL;
    h->dec = mpeg2_init ();
    if (!h->dec) {
        free (h);
        return NULL;
    }
    h->info = mpeg2_info (h->dec);
    h->index = -1;
    return h;
}

/* A buffer of at least `size` bytes for the next feed, or NULL when it cannot be had (no memory: the old buffer is
 * kept as it was, and a feed larger than it is refused). Only valid to call when s2u_fmv_next has returned 0: until
 * then libmpeg2 may still be reading the previous one. */
EXPORT uint8_t * s2u_fmv_buffer (s2u_fmv_t * h, unsigned size)
{
    if (size > h->in_size || !h->in) {
        uint8_t * p = (uint8_t *) realloc (h->in, size ? size : 1);
        if (!p)
            return NULL;
        h->in = p;
        h->in_size = size ? size : 1;
    }
    return h->in;
}

/* Hand libmpeg2 the first `size` bytes of the input buffer. 0, or -1 when the buffer does not hold `size` bytes (a
 * failed s2u_fmv_buffer): nothing is read past it. Bytes fed after a flush continue the stream, so it can be flushed
 * again at its own end. */
EXPORT int s2u_fmv_feed (s2u_fmv_t * h, unsigned size)
{
    if (!h->in || size > h->in_size)
        return -1;
    h->flushed = 0;
    mpeg2_buffer (h->dec, h->in, h->in + size);
    return 0;
}

/* As s2u_fmv_feed, and the next picture whose start code is in these bytes carries `tag` (mpeg2_tag_picture). */
EXPORT int s2u_fmv_feed_tagged (s2u_fmv_t * h, unsigned size, uint32_t tag)
{
    if (!h->in || size > h->in_size)
        return -1;
    mpeg2_tag_picture (h->dec, tag, 0);
    return s2u_fmv_feed (h, size);
}

/* 1: a picture is ready (read it with the accessors below); 0: feed more bytes (or stop after a flush);
 * -1: the decoder reported an invalid stream state (decoding continues on the next call). */
EXPORT int s2u_fmv_next (s2u_fmv_t * h)
{
    for (;;) {
        mpeg2_state_t state = mpeg2_parse (h->dec);
        switch (state) {
        case STATE_BUFFER:
            return 0;
        case STATE_SEQUENCE:
        case STATE_SEQUENCE_REPEATED:
        case STATE_SEQUENCE_MODIFIED:
            h->seen_sequence = 1;
            h->ended = 0;    /* a stream that goes on after a sequence_end_code needs its own end (s2u_fmv_flush) */
            break;
        case STATE_GOP:
        case STATE_PICTURE:
            h->ended = 0;
            break;
        case STATE_SLICE:
        case STATE_END:
        case STATE_INVALID_END:
            if (state == STATE_END)
                h->ended = 1;
            if (state == STATE_INVALID_END && h->seen_sequence)
                h->invalid++;
            if (h->info->display_fbuf) {
                const mpeg2_picture_t * p = h->info->display_picture;
                h->index++;
                h->planes[0] = h->info->display_fbuf->buf[0];
                h->planes[1] = h->info->display_fbuf->buf[1];
                h->planes[2] = h->info->display_fbuf->buf[2];
                h->flags = p ? p->flags : 0;
                h->temporal_reference = p ? p->temporal_reference : 0;
                h->nb_fields = p ? p->nb_fields : 0;
                h->tagged = p && (p->flags & PIC_FLAG_TAGS) ? 1 : 0;
                h->tag = p ? p->tag : 0;
                return 1;
            }
            if (state == STATE_INVALID_END && h->seen_sequence)
                return -1;
            break;
        case STATE_INVALID:
            if (h->seen_sequence) {
                h->invalid++;
                return -1;
            }
            break;
        default:
            break;
        }
    }
}

/* End of input: if the stream did not end with a sequence_end_code, feed one, so that libmpeg2 completes the last
 * picture and releases the reference picture it holds back for display order. Drain s2u_fmv_next afterwards. A
 * sequence_end_code in the middle of the stream does not count: `ended` is cleared by whatever is decoded after it. */
EXPORT int s2u_fmv_flush (s2u_fmv_t * h)
{
    static const uint8_t end_code[4] = { 0, 0, 1, 0xb7 };
    uint8_t * p;
    if (h->ended || h->flushed)
        return 0;
    p = s2u_fmv_buffer (h, 4);
    if (!p)
        return -1;
    memcpy (p, end_code, 4);
    s2u_fmv_feed (h, 4);
    h->flushed = 1;
    return 0;
}

/* Forget the stream: the next bytes begin a new one, from its sequence header (a second movie on this handle, or
 * the same movie from its start). libmpeg2's full reset (mpeg2_reset(dec, 1)) frees the frame buffers it allocated,
 * which the next sequence header allocates again; the glue's own state goes back to s2u_fmv_open's. */
EXPORT void s2u_fmv_reset (s2u_fmv_t * h)
{
    mpeg2_reset (h->dec, 1);
    h->ended = 0;
    h->flushed = 0;
    h->invalid = 0;
    h->seen_sequence = 0;
    h->index = -1;
    h->planes[0] = h->planes[1] = h->planes[2] = NULL;
    h->flags = 0;
    h->temporal_reference = 0;
    h->nb_fields = 0;
    h->tag = 0;
    h->tagged = 0;
}

EXPORT uint8_t * s2u_fmv_plane (s2u_fmv_t * h, int k) { return (k >= 0 && k < 3) ? h->planes[k] : NULL; }
EXPORT int s2u_fmv_index (s2u_fmv_t * h) { return h->index; }
EXPORT uint32_t s2u_fmv_tag (s2u_fmv_t * h) { return h->tag; }
EXPORT int s2u_fmv_tagged (s2u_fmv_t * h) { return h->tagged; }
/* The displayed picture's coding type: 1 I, 2 P, 3 B, 4 D (PIC_MASK_CODING_TYPE). */
EXPORT int s2u_fmv_type (s2u_fmv_t * h) { return (int) (h->flags & PIC_MASK_CODING_TYPE); }
EXPORT uint32_t s2u_fmv_flags (s2u_fmv_t * h) { return h->flags; }
EXPORT unsigned s2u_fmv_temporal_reference (s2u_fmv_t * h) { return h->temporal_reference; }
EXPORT unsigned s2u_fmv_nb_fields (s2u_fmv_t * h) { return h->nb_fields; }
EXPORT int s2u_fmv_invalid (s2u_fmv_t * h) { return h->invalid; }
EXPORT int s2u_fmv_ended (s2u_fmv_t * h) { return h->ended; }
EXPORT unsigned s2u_fmv_width (s2u_fmv_t * h) { return h->info->sequence ? h->info->sequence->width : 0; }
EXPORT unsigned s2u_fmv_height (s2u_fmv_t * h) { return h->info->sequence ? h->info->sequence->height : 0; }
EXPORT unsigned s2u_fmv_chroma_width (s2u_fmv_t * h) { return h->info->sequence ? h->info->sequence->chroma_width : 0; }
EXPORT unsigned s2u_fmv_chroma_height (s2u_fmv_t * h) { return h->info->sequence ? h->info->sequence->chroma_height : 0; }
/* MPEG2_RELEASE, so a caller can check what it loaded. */
EXPORT unsigned s2u_fmv_release (void) { return MPEG2_RELEASE; }

EXPORT void s2u_fmv_close (s2u_fmv_t * h)
{
    if (!h)
        return;
    mpeg2_close (h->dec);
    free (h->in);
    free (h);
}
