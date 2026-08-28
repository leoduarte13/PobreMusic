export interface PresetPlaylistOption {
  id: string;
  spotifyUrlOrId: string;
  name: string;
  genre: string;
  description: string;
  cover: string;
  trackCount: number;
}

export const PRESET_OPTIONS: PresetPlaylistOption[] = [
  {
    id: "top_hits",
    spotifyUrlOrId: "top_hits",
    name: "Global Top Hits 2026",
    genre: "Pop & Trending",
    description: "Os maiores sucessos mundiais do The Weeknd, Harry Styles, Miley Cyrus e mais.",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    trackCount: 7,
  },
  {
    id: "brasil_vibes",
    spotifyUrlOrId: "brasil_vibes",
    name: "Brasil MPB & Acústico",
    genre: "MPB & Bossa",
    description: "Clássicos de Tom Jobim, Alceu Valença, Legião Urbana e Vanessa da Mata.",
    cover: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&auto=format&fit=crop&q=80",
    trackCount: 5,
  },
  {
    id: "lofi_study",
    spotifyUrlOrId: "lofi_study",
    name: "Lofi Beats for Study",
    genre: "Chill & Focus",
    description: "Batidas calmas para trabalhar, estudar e relaxar.",
    cover: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80",
    trackCount: 4,
  },
  {
    id: "today_top_hits_spotify",
    spotifyUrlOrId: "37i9dQZF1DXcBWIGoYBM5M",
    name: "Spotify: Today's Top Hits",
    genre: "Spotify Official",
    description: "ID Oficial da playlist mais ouvida do Spotify (37i9dQZF1DXcBWIGoYBM5M).",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
    trackCount: 50,
  }
];
