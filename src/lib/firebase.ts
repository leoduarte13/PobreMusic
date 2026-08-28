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
  orderBy,
  getDocFromServer
} from "firebase/firestore";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { SavedPlaylist, GoogleUserProfile, EqualizerState } from "../types";

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with specific databaseId if provided
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Skill Error Handler Enums & Interface
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection on init
export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Please check your Firebase configuration or network.");
    }
  }
}
testFirestoreConnection();

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle(): Promise<GoogleUserProfile> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Save/Update user profile document in /users/{userId}
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      id: user.uid,
      email: user.email || "",
      displayName: user.displayName || "Usuário",
      photoURL: user.photoURL || "",
      lastLogin: Date.now(),
    }, { merge: true });

    return {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    };
  } catch (error: any) {
    console.error("[Firebase Auth] Error signing in with Google:", error);
    throw error;
  }
}

/**
 * Sign out Google user
 */
export async function logoutGoogle(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("[Firebase Auth] Error signing out:", error);
    throw error;
  }
}

/**
 * Subscribe to Auth State Changes
 */
export function subscribeToAuth(callback: (user: GoogleUserProfile | null) => void): () => void {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      callback({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      });
    } else {
      callback(null);
    }
  });
}

/**
 * Save or update an individual user's playlist in their private collection:
 * /users/{userId}/playlists/{playlistId}
 */
export async function saveUserPlaylistToCloud(userId: string, playlist: SavedPlaylist): Promise<void> {
  const path = `users/${userId}/playlists/${playlist.id}`;
  try {
    const playlistRef = doc(db, "users", userId, "playlists", playlist.id);
    const payload = {
      id: playlist.id,
      userId: userId,
      name: playlist.name.slice(0, 150),
      description: (playlist.description || "").slice(0, 500),
      cover: (playlist.cover || "").slice(0, 2000),
      tracks: (playlist.tracks || []).slice(0, 500),
      createdAt: playlist.createdAt || Date.now(),
      updatedAt: Date.now(),
      isCloud: true,
    };
    await setDoc(playlistRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete a playlist from the user's private collection
 */
export async function deleteUserPlaylistFromCloud(userId: string, playlistId: string): Promise<void> {
  const path = `users/${userId}/playlists/${playlistId}`;
  try {
    const playlistRef = doc(db, "users", userId, "playlists", playlistId);
    await deleteDoc(playlistRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Fetch all private playlists of a specific user
 */
export async function fetchUserCloudPlaylists(userId: string): Promise<SavedPlaylist[]> {
  const path = `users/${userId}/playlists`;
  try {
    const playlistsCol = collection(db, "users", userId, "playlists");
    const q = query(playlistsCol, orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    const playlists: SavedPlaylist[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      playlists.push({
        id: data.id || docSnap.id,
        userId: data.userId || userId,
        name: data.name || "Playlist Sem Nome",
        description: data.description || "",
        cover: data.cover || "",
        tracks: Array.isArray(data.tracks) ? data.tracks : [],
        createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
        updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
        isCloud: true,
      });
    });
    return playlists;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Real-time subscription to an individual user's playlists in Firestore
 */
export function subscribeToUserCloudPlaylists(
  userId: string,
  callback: (playlists: SavedPlaylist[]) => void,
  onError?: (error: Error) => void
): () => void {
  const path = `users/${userId}/playlists`;
  try {
    const playlistsCol = collection(db, "users", userId, "playlists");
    const q = query(playlistsCol, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const playlists: SavedPlaylist[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          playlists.push({
            id: data.id || docSnap.id,
            userId: data.userId || userId,
            name: data.name || "Playlist Sem Nome",
            description: data.description || "",
            cover: data.cover || "",
            tracks: Array.isArray(data.tracks) ? data.tracks : [],
            createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
            updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
            isCloud: true,
          });
        });
        callback(playlists);
      },
      (error) => {
        console.warn("[Firebase] Playlist subscription error:", error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err: any) {
    console.error("[Firebase] Could not subscribe to user playlists:", err);
    return () => {};
  }
}

/**
 * Save user settings (Equalizer, volume, preferences) in /users/{userId}
 */
export async function saveUserSettingsToCloud(
  userId: string,
  settings: {
    equalizer?: EqualizerState;
    volume?: number;
    shuffle?: boolean;
    repeatMode?: string;
    lastPlaylistId?: string;
  }
): Promise<void> {
  const path = `users/${userId}`;
  try {
    const userDoc = doc(db, "users", userId);
    await setDoc(userDoc, { preferences: settings, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.warn("[Firebase] Error saving user settings to cloud:", err);
  }
}

