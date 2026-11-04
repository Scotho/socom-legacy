"""Deterministic original-authored fixture writer/checker; Python standard library only.

These collision documents are neutral source data, NOT AssetDefinition or pack wire.
Run with --check to decode and compare committed bytes without writing anything.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "source.json"
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
EXTERNAL_URI = "https://example.invalid/creator-fixture-never-fetch.png"


def encoded(value, *, pretty=False):
    return (json.dumps(value, sort_keys=True, allow_nan=False,
                       indent=2 if pretty else None,
                       separators=None if pretty else (",", ":"))
            + ("\n" if pretty else "")).encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sub(a, b):
    return [x - y for x, y in zip(a, b)]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def glb(source, variant):
    """Flat normals and separate vertices per face preserve the marker colors."""
    positions, normals, indices = [], [], []
    for face in source["faces"]:
        points = [source["vertices"][i] for i in face["indices"]]
        normal = cross(sub(points[1], points[0]), sub(points[2], points[0]))
        normal = [n / math.sqrt(dot(normal, normal)) for n in normal]
        start = len(positions)
        positions.extend(points)
        normals.extend([normal] * 4)
        indices.extend([start, start + 1, start + 2, start, start + 2, start + 3])
    pos = struct.pack("<72f", *(v for p in positions for v in p))
    norm = struct.pack("<72f", *(v for n in normals for v in n))
    uv = struct.pack("<48f", *([0, 0, 1, 0, 1, 1, 0, 1] * 6))
    ind = struct.pack("<36H", *indices)
    body = pos + norm + uv + ind
    node = {"name": "signal-crate-" + variant["name"], "mesh": 0}
    if variant["scale"] != [1, 1, 1]:
        node["scale"] = variant["scale"]
    doc = {
        "asset": {"version": "2.0", "generator": "redotcom original fixture generate.py"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [node],
        "buffers": [{"byteLength": len(body)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos), "byteLength": len(norm), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos) + len(norm), "byteLength": len(uv), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos) + len(norm) + len(uv), "byteLength": len(ind), "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 24, "type": "VEC3",
             "min": [-1, 0, -0.5], "max": [1, 1.5, 0.5]},
            {"bufferView": 1, "componentType": 5126, "count": 24, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": 24, "type": "VEC2"},
        ] + [{"bufferView": 3, "byteOffset": i * 12, "componentType": 5123,
              "count": 6, "type": "SCALAR"} for i in range(6)],
        "meshes": [{"name": "original-signal-crate", "primitives": [
            {"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3 + i,
             "material": i, "mode": 4} for i in range(6)]}],
        "materials": [{"name": f["name"], "pbrMetallicRoughness": {
            "baseColorFactor": f["rgba"], "metallicFactor": 0, "roughnessFactor": 1}}
            for f in source["faces"]],
    }
    if variant["externalImage"]:
        # A used image, not an inert URI: ordinary loader use would request it.
        doc["images"] = [{"uri": EXTERNAL_URI}]
        doc["textures"] = [{"source": 0}]
        doc["materials"][2]["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}
    text = encoded(doc)
    text += b" " * (-len(text) % 4)
    body += b"\0" * (-len(body) % 4)
    return (struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(body))
            + struct.pack("<II", len(text), 0x4E4F534A) + text
            + struct.pack("<II", len(body), 0x004E4942) + body)


def collision(source, variant, source_sha, render_sha):
    matrix = IDENTITY.copy()
    matrix[0], matrix[5], matrix[10] = variant["scale"]
    vertices = source["vertices"]
    if variant["collision"] == "collapsed-y":
        vertices = [[x, 0, z] for x, _, z in vertices]
    hulls = [] if variant["collision"] == "none" else [{
        "vertices": vertices,
        "faces": [{"name": f["name"], "indices": f["indices"]} for f in source["faces"]],
    }]
    return {
        "purpose": "neutral authored fixture source; runtime/pack adaptation owed",
        "variant": variant["name"], "sourceFile": "source.json", "sourceSha256": source_sha,
        "renderFile": variant["name"] + ".glb", "renderSha256": render_sha,
        "coordinates": source["coordinates"],
        "nodeMatrixColumnMajor": matrix,
        "transformsBaked": variant["scale"] == [1, 1, 1],
        "intendedCollision": variant["collision"], "hulls": hulls,
        "provenance": source["provenance"], "license": source["license"],
    }


def verify_glb(data, source, variant):
    """Tiny structural decoder, not a glTF validator or runtime loader."""
    magic, version, size = struct.unpack_from("<III", data)
    assert (magic, version, size) == (0x46546C67, 2, len(data))
    chunks, offset = [], 12
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        assert length % 4 == 0 and offset + 8 + length <= len(data)
        chunks.append((kind, data[offset + 8:offset + 8 + length]))
        offset += 8 + length
    assert offset == len(data) and [k for k, _ in chunks] == [0x4E4F534A, 0x004E4942]
    doc, body = json.loads(chunks[0][1]), chunks[1][1]
    assert doc["buffers"] == [{"byteLength": len(body)}]
    assert doc["nodes"][0].get("scale", [1, 1, 1]) == variant["scale"]
    assert not any(k in doc for k in ("skins", "animations", "extensionsRequired"))
    uris = [item["uri"] for key in ("images", "buffers")
            for item in doc.get(key, []) if "uri" in item]
    assert uris == ([EXTERNAL_URI] if variant["externalImage"] else [])
    decoded = []
    for accessor in doc["accessors"]:
        view = doc["bufferViews"][accessor["bufferView"]]
        fmt, width = {5126: ("f", 4), 5123: ("H", 2)}[accessor["componentType"]]
        components = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[accessor["type"]]
        assert view["buffer"] == 0 and view["byteOffset"] % 4 == 0
        start = view["byteOffset"] + accessor.get("byteOffset", 0)
        end = start + accessor["count"] * width * components
        assert end <= view["byteOffset"] + view["byteLength"] <= len(body)
        values = struct.unpack_from("<" + fmt * accessor["count"] * components, body, start)
        assert all(math.isfinite(v) for v in values)
        decoded.append(values)
    expected_positions = tuple(v for f in source["faces"]
                               for i in f["indices"] for v in source["vertices"][i])
    assert decoded[0] == expected_positions
    assert [min(decoded[0][i::3]) for i in range(3)] == doc["accessors"][0]["min"]
    assert [max(decoded[0][i::3]) for i in range(3)] == doc["accessors"][0]["max"]
    for face_index, face in enumerate(source["faces"]):
        assert decoded[face_index + 3] == tuple(face_index * 4 + i for i in (0, 1, 2, 0, 2, 3))
        assert doc["materials"][face_index]["pbrMetallicRoughness"]["baseColorFactor"] == face["rgba"]
    assert len(doc["meshes"][0]["primitives"]) == 6


def verify_hull(sidecar, variant):
    matrix = sidecar["nodeMatrixColumnMajor"]
    assert matrix[0] * matrix[5] * matrix[10] == (-1 if variant["name"] == "mirrored-transform" else 1)
    if variant["collision"] == "none":
        assert sidecar["hulls"] == []
        return
    hull = sidecar["hulls"][0]
    vertices = hull["vertices"]
    edges, zero_faces, volume = {}, 0, 0
    for face in hull["faces"]:
        ids = face["indices"]
        a, b, c = [vertices[i] for i in ids[:3]]
        normal = cross(sub(b, a), sub(c, a))
        zero_faces += dot(normal, normal) == 0
        for vertex in vertices:
            assert dot(normal, sub(vertex, a)) <= 1e-12, "outward convex face"
        for i, left in enumerate(ids):
            right = ids[(i + 1) % len(ids)]
            edges[(left, right)] = edges.get((left, right), 0) + 1
        for i in range(1, len(ids) - 1):
            volume += dot(a, cross(vertices[ids[i]], vertices[ids[i + 1]])) / 6
    assert len(edges) == 24 and all(n == 1 and edges.get((b, a)) == 1 for (a, b), n in edges.items())
    if variant["collision"] == "collapsed-y":
        assert zero_faces == 4 and volume == 0 and len({tuple(v) for v in vertices}) == 4
    else:
        assert zero_faces == 0 and math.isclose(volume, 3), "2 x 1.5 x 1 metre closed box"


def outputs():
    raw = SOURCE.read_bytes()
    source, source_sha = json.loads(raw), digest(raw)
    result = {}
    for variant in source["variants"]:
        render = glb(source, variant)
        assert render == glb(source, variant), "generation must be deterministic"
        verify_glb(render, source, variant)
        sidecar = collision(source, variant, source_sha, digest(render))
        verify_hull(sidecar, variant)
        result[variant["name"] + ".glb"] = render
        result[variant["name"] + ".collision-source.json"] = encoded(sidecar, pretty=True)
    inventory = {
        "purpose": "fixture byte inventory, not an import manifest",
        "source": {"file": "source.json", "sha256": source_sha, "bytes": len(raw)},
        "generated": [{"file": name, "sha256": digest(data), "bytes": len(data)}
                      for name, data in sorted(result.items())],
    }
    result["inventory.json"] = encoded(inventory, pretty=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="decode and compare; do not write")
    args = parser.parse_args()
    result = outputs()
    for name, data in result.items():
        path = HERE / name
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                raise SystemExit("stale or missing generated fixture: " + name)
        else:
            path.write_bytes(data)
    print(("CHECK" if args.check else "GENERATED") + ": 5 GLBs, 5 neutral collision sidecars, inventory")
    print("Structural decode and deterministic byte comparison only; runtime acceptance NOT RUN.")
    for name, data in sorted(result.items()):
        print(f"{name}: {len(data)} bytes sha256 {digest(data)}")


if __name__ == "__main__":
    main()
