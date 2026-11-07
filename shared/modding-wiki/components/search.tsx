'use client';
import { useStaticSearch } from 'fumadocs-core/search/client/orama-static';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';

/** Where the build writes the index (app/api/search/route.ts); scripts/check-search.mjs reads the same path. */
const SEARCH_INDEX = '/api/search';

// The search dialog on the static index (MW-9): the index is fetched once from the exported file and searched in the
// browser, so the site needs no server.
export default function StaticSearchDialog(props: SharedProps) {
  const search = useStaticSearch({ from: SEARCH_INDEX });
  return (
    <SearchDialog {...search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList />
      </SearchDialogContent>
    </SearchDialog>
  );
}
