export const VIDEO_PAGE_SIZE = 6;
export const PEOPLE_PAGE_SIZE = 20;
export type CallPerson = {
  identity: string;
  name?: string;
  isLocal: boolean;
  isScreenShareEnabled: boolean;
};
export function callPage<T extends CallPerson>(
  people: T[],
  query: string,
  page: number,
  size: number,
) {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle
    ? people.filter((p) =>
        (p.name || "Guest").toLocaleLowerCase().includes(needle),
      )
    : people;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.max(0, Math.min(Math.trunc(page) || 0, pages - 1));
  return {
    items: filtered.slice(current * size, (current + 1) * size),
    total: filtered.length,
    page: current,
    pages,
  };
}
export function callFocus<T extends CallPerson>(
  people: T[],
  pinned: string,
  speakers: string[],
  lastSpeaker: string,
) {
  return (
    people.find((p) => p.identity === pinned) ||
    people.find((p) => p.isScreenShareEnabled) ||
    people.find((p) => p.identity === speakers[0]) ||
    people.find((p) => p.identity === lastSpeaker) ||
    people.find((p) => !p.isLocal) ||
    people[0]
  );
}
export function videoSelection<T extends CallPerson>(
  people: T[],
  mode: "stage" | "gallery",
  page: number,
  pinned: string,
  speakers: string[],
  lastSpeaker: string,
) {
  const focus = callFocus(people, pinned, speakers, lastSpeaker);
  const tiles =
    mode === "stage"
      ? focus
        ? [focus]
        : []
      : callPage(people, "", page, VIDEO_PAGE_SIZE).items;
  return { focus, tiles, identities: new Set(tiles.map((p) => p.identity)) };
}
