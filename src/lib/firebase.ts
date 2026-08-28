import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp,
  query,
  orderBy
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { SavedPlaylist, Track, EqualizerState } from "../types";

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with specific databaseId if provided
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

const PLAYLISTS_COLLECTION = "playlists";
const APP_STATE_COLLECTION = "app_settings";

/**
 * Save or update a playlist in Firestore Cloud
 */
export async function savePlaylistToCloud(playlist: SavedPlaylist): Promise<void> {
  try {
    const playlistRef = doc(db, PLAYLISTS_COLLECTION, playlist.id);
    const payload = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description || "",
      cover: playlist.cover || "",
      tracks: playlist.tracks || [],
      createdAt: playlist.createdAt || Date.now(),
      updatedAt: Date.now(),
      syncedAt: serverTimestamp(),
      isCloud: true,
    };
    await setDoc(playlistRef, payload, { merge: true });
  } catch (error) {
    console.error("[Firebase] Error saving playlist to cloud:", error);
    throw error;
  }
}

/**
 * Delete a playlist from Firestore Cloud
 */
export async function deletePlaylistFromCloud(playlistId: string): Promise<void> {
  try {
    const playlistRef = doc(db, PLAYLISTS_COLLECTION, playlistId);
    await deleteDoc(playlistRef);
  } catch (error) {
    console.error("[Firebase] Error deleting playlist from cloud:", error);
    throw error;
  }
}

/**
 * Fetch all cloud playlists from Firestore
 */
export async function fetchCloudPlaylists(): Promise<SavedPlaylist[]> {
  try {
    const playlistsCol = collection(db, PLAYLISTS_COLLECTION);
    const q = query(playlistsCol, orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    const playlists: SavedPlaylist[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      playlists.push({
        id: data.id || docSnap.id,
        name: data.name || "Playlist Sem Nome",
        description: data.description || "",
        cover: data.cover || "",
        tracks: Array.isArray(data.tracks) ? data.tracks : [],
        createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
        updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
      });
    });
    return playlists;
  } catch (error) {
    console.error("[Firebase] Error fetching cloud playlists:", error);
    return [];
  }
}

/**
 * Subscribe in real-time to cloud playlists
 */
export function subscribeToCloudPlaylists(
  callback: (playlists: SavedPlaylist[]) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const playlistsCol = collection(db, PLAYLISTS_COLLECTION);
    const q = query(playlistsCol, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const playlists: SavedPlaylist[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          playlists.push({
            id: data.id || docSnap.id,
            name: data.name || "Playlist Sem Nome",
            description: data.description || "",
            cover: data.cover || "",
            tracks: Array.isArray(data.tracks) ? data.tracks : [],
            createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
            updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
          });
        });
        callback(playlists);
      },
      (error) => {
        console.warn("[Firebase] Firestore subscription error:", error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.error("[Firebase] Could not subscribe to playlists:", err);
    return () => {};
  }
}

/**
 * Save user cloud settings (Equalizer, volume, preferences)
 */
export async function saveUserSettingsToCloud(settings: {
  equalizer?: EqualizerState;
  volume?: number;
  shuffle?: boolean;
  repeatMode?: string;
  lastPlaylistId?: string;
}): Promise<void> {
  try {
    const userDoc = doc(db, APP_STATE_COLLECTION, "global_preferences");
    await setDoc(userDoc, { ...settings, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.warn("[Firebase] Error saving user settings to cloud:", err);
  }
}
