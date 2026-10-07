/**
 * radio.garden has no genre data, so genres are inferred from station names and,
 * where available, Radio Browser tags. Each genre has a matcher and a search term
 * used to find more stations like it.
 */

export type GenreId =
  | 'techno' | 'house' | 'electronic' | 'chill' | 'dnb' | 'trance'
  | 'hiphop' | 'rnb' | 'pop' | 'hits' | 'retro' | 'rock' | 'metal' | 'indie'
  | 'jazz' | 'blues' | 'soul' | 'classical' | 'latin' | 'reggae' | 'afro'
  | 'country' | 'folk' | 'world' | 'news' | 'sports' | 'religious' | 'kids';

type Genre = { label: string; match: RegExp; search: string };

const w = (s: string) => new RegExp(`(^|[^a-z])(${s})([^a-z]|$)`, 'i');

export const GENRES: Record<GenreId, Genre> = {
  techno: { label: 'Techno', match: w('techno|tekno|hard ?techno|minimal'), search: 'techno' },
  house: { label: 'House', match: w('house|deep ?house|tech ?house|garage'), search: 'house' },
  electronic: { label: 'Electronic', match: w('electro(nic|nica)?|edm|dance|club(bing)?|synth(wave)?|idm'), search: 'electronic' },
  chill: { label: 'Chill & Lo-fi', match: w('chill(out)?|lo-?fi|lounge|ambient|downtempo|relax(ing)?|smooth'), search: 'chill' },
  dnb: { label: 'Drum & Bass', match: w('dnb|d&b|drum ?(and|&|n) ?bass|jungle|dubstep|bass'), search: 'drum and bass' },
  trance: { label: 'Trance', match: w('trance|psy(trance)?|goa|progressive'), search: 'trance' },
  hiphop: { label: 'Hip-Hop', match: w('hip ?-?hop|rap|deutschrap|trap|urban|grime|drill'), search: 'hip hop' },
  rnb: { label: 'R&B', match: w('r ?(&|n|and|\'n\') ?b|rnb'), search: 'rnb' },
  pop: { label: 'Pop', match: w('pop|k-?pop|j-?pop|top ?40|chart(s)?|adult contemporary'), search: 'pop' },
  hits: { label: 'Hits', match: w('hits?|hit ?radio|mix'), search: 'hits' },
  retro: { label: 'Retro & Oldies', match: w('[5-9]0s|[5-9]0er|oldies|retro|gold|classic hits|nostalgi[ae]|back ?to'), search: '80s' },
  rock: { label: 'Rock', match: w('rock|classic rock|hard ?rock|grunge|punk'), search: 'rock' },
  metal: { label: 'Metal', match: w('metal|heavy|hardcore'), search: 'metal' },
  indie: { label: 'Indie & Alt', match: w('indie|alternative|alt|college'), search: 'indie' },
  jazz: { label: 'Jazz', match: w('jazz|swing|bebop|big ?band'), search: 'jazz' },
  blues: { label: 'Blues', match: w('blues'), search: 'blues' },
  soul: { label: 'Soul & Funk', match: w('soul|funk|disco|motown'), search: 'soul' },
  classical: { label: 'Classical', match: w('classic(al)?|klassik|cl[aá]sica|classique|opera|symphon(y|ic)|baroque|philharmon'), search: 'classical' },
  latin: { label: 'Latin', match: w('latin[ao]?|salsa|reggaet[oó]n|bachata|cumbia|tropical|merengue|ranchera|banda|bossa|samba|sertanejo'), search: 'latino' },
  reggae: { label: 'Reggae', match: w('reggae|dancehall|ska|dub'), search: 'reggae' },
  afro: { label: 'Afrobeats', match: w('afro(beats?)?|amapiano|highlife|bongo'), search: 'afro' },
  country: { label: 'Country', match: w('country|americana|bluegrass|western'), search: 'country' },
  folk: { label: 'Folk', match: w('folk|narodna|izvorna|traditional|celtic|schlager|volksmusik'), search: 'folk' },
  world: { label: 'World', match: w('world|bollywood|desi|arab(ic)?|turk(ish)?|persian|bhangra|chanson|fado|flamenco'), search: 'world' },
  news: { label: 'News & Talk', match: w('news|talk|info(rmation)?|nachrichten|noticias|actualit[eé]|public radio|npr|bbc|current affairs'), search: 'news' },
  sports: { label: 'Sports', match: w('sports?|football|futbol|deportes|espn'), search: 'sports' },
  religious: { label: 'Faith', match: w('christian|gospel|catholic|church|worship|praise|quran|islam(ic)?|maria|bible|evangel'), search: 'gospel' },
  kids: { label: 'Kids', match: w('kids?|children|kinder|enfants'), search: 'kids' },
};

export const GENRE_IDS = Object.keys(GENRES) as GenreId[];

/** Genres found in a station name plus any external tags. */
export function genresOf(title: string, tags: string[] = []): GenreId[] {
  const text = [title, ...tags].join(' , ');
  return GENRE_IDS.filter((id) => GENRES[id].match.test(text));
}

/** Network/brand from names like "80s80s - Bowie" or "Hits1 | Latina". */
export function networkOf(title: string): string | null {
  const parts = title.split(/\s+[-–|:]\s+/);
  if (parts.length < 2) return null;
  const brand = parts[0].trim().toLowerCase();
  return brand.length >= 3 && brand.length <= 24 ? brand : null;
}
