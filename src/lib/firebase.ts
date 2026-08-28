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
  signInWithRedirect,
  signInWithCredential,
  signInAnonymously,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { SavedPlaylist, GoogleUserProfile, EqualizerState } from "../types";

declare global {
  interface Window {
    google?: any;
  }
}

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

// Ensure auth session is ready for Firestore operations
async function ensureAuthUser(): Promise<string> {
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }
  try {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (e) {
    console.warn("[Firebase Auth] Anonymous fallback warning:", e);
    return "guest_user";
  }
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
 * Format and decode Firebase Auth errors into clear, actionable messages
 */
export function formatAuthErrorMessage(error: any): { title: string; message: string; isDomainError: boolean; currentDomain: string } {
  const currentDomain = typeof window !== "undefined" ? window.location.hostname : "";
  const errorCode = error?.code || "";
  const errorMessage = error?.message || String(error);

  if (errorCode === "auth/unauthorized-domain") {
    return {
      title: "Domínio não autorizado no Firebase",
      message: `O domínio atual (${currentDomain}) precisa ser adicionado na lista de Domínios Autorizados no Firebase Console para permitir o login com Google.\n\nComo resolver no Firebase Console:\n1. Acesse o Firebase Console do seu projeto.\n2. Vá em Authentication > Configurações (Settings) > Domínios Autorizados.\n3. Clique em 'Adicionar Domínio' e insira: ${currentDomain}`,
      isDomainError: true,
      currentDomain,
    };
  }

  if (errorCode === "auth/popup-blocked") {
    return {
      title: "Janela pop-up bloqueada",
      message: "O navegador do seu celular ou computador bloqueou a abertura da janela do Google. Toque em 'Entrar com Google' novamente para tentar redirecionamento direto ou permita popups.",
      isDomainError: false,
      currentDomain,
    };
  }

  if (errorCode === "auth/popup-closed-by-user" || errorCode === "auth/cancelled-popup-request") {
    return {
      title: "Login cancelado",
      message: "A janela de login do Google foi fechada antes de concluir.",
      isDomainError: false,
      currentDomain,
    };
  }

  return {
    title: "Erro ao conectar com Google",
    message: errorMessage || "Não foi possível completar a autenticação no momento.",
    isDomainError: false,
    currentDomain,
  };
}

/**
 * Helper to dynamically load Google Identity Services if not already present
 */
function loadGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    if (window.google?.accounts?.oauth2) return resolve();

    const existingScript = document.getElementById("gsi-client-script");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      setTimeout(resolve, 2000);
      return;
    }

    const script = document.createElement("script");
    script.id = "gsi-client-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
    setTimeout(resolve, 2000);
  });
}

/**
 * Sign in using Google Identity Services (GIS) Token Client
 * Runs directly on accounts.google.com and bypasses domain restrictions
 */
async function signInWithGISTokenClient(): Promise<GoogleUserProfile> {
  await loadGoogleIdentityServices();

  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId || !window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services not available");
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid profile email",
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.warn("[GSI] Token response error:", tokenResponse);
            return reject(new Error(tokenResponse.error_description || tokenResponse.error));
          }

          const accessToken = tokenResponse.access_token;
          if (!accessToken) {
            return reject(new Error("No access token returned from Google"));
          }

          try {
            // Fetch profile directly from Google
            const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const userInfo = await userInfoRes.json();

            // Link / Sign in to Firebase Auth using the credential
            let fbUser: User | null = null;
            try {
              const credential = GoogleAuthProvider.credential(null, accessToken);
              const result = await signInWithCredential(auth, credential);
              fbUser = result.user;
            } catch (fbErr) {
              console.warn("[Firebase Auth] Credential link fallback:", fbErr);
              // If credential exchange fails, ensure anonymous auth for Firestore
              try {
                const anonResult = await signInAnonymously(auth);
                fbUser = anonResult.user;
              } catch {}
            }

            const uid = fbUser?.uid || userInfo.sub || `google_${Date.now()}`;
            const profile: GoogleUserProfile = {
              uid,
              displayName: userInfo.name || userInfo.given_name || "Usuário Google",
              email: userInfo.email || null,
              photoURL: userInfo.picture || null,
            };

            // Save to LocalStorage
            try {
              localStorage.setItem("spottube_google_user_profile", JSON.stringify(profile));
            } catch {}

            // Save in Firestore if available
            try {
              const userRef = doc(db, "users", uid);
              await setDoc(userRef, {
                id: uid,
                email: profile.email || "",
                displayName: profile.displayName || "",
                photoURL: profile.photoURL || "",
                lastLogin: Date.now(),
              }, { merge: true });
            } catch (dbErr) {
              console.warn("[Firebase] Could not save user profile doc:", dbErr);
            }

            resolve(profile);
          } catch (err) {
            reject(err);
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch (initErr) {
      reject(initErr);
    }
  });
}

/**
 * Handle initial redirect result (especially for mobile browsers)
 */
export async function checkRedirectAuthResult(): Promise<GoogleUserProfile | null> {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const user = result.user;
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        id: user.uid,
        email: user.email || "",
        displayName: user.displayName || "Usuário",
        photoURL: user.photoURL || "",
        lastLogin: Date.now(),
      }, { merge: true });

      const profile: GoogleUserProfile = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      };

      try {
        localStorage.setItem("spottube_google_user_profile", JSON.stringify(profile));
      } catch {}

      return profile;
    }
  } catch (error: any) {
    console.warn("[Firebase Auth] Redirect auth result notice:", error);
  }

  // Check cached profile in localStorage
  try {
    const stored = localStorage.getItem("spottube_google_user_profile");
    if (stored) {
      const profile = JSON.parse(stored);
      if (profile && profile.uid) {
        // Ensure anonymous auth is active in background so Firestore rules pass
        ensureAuthUser().catch(() => {});
        return profile;
      }
    }
  } catch {}

  return null;
}

/**
 * Sign in with Google (Multi-strategy: GIS OAuth -> Firebase Popup -> Firebase Redirect)
 */
export async function signInWithGoogle(useRedirectFallback = true): Promise<GoogleUserProfile> {
  // Strategy 1: Google Identity Services (Bypasses domain authorization issues)
  try {
    if (typeof window !== "undefined" && firebaseConfig.oAuthClientId) {
      const profile = await signInWithGISTokenClient();
      return profile;
    }
  } catch (gisErr: any) {
    console.warn("[Google Auth] GSI token flow notice, trying Firebase popup:", gisErr);
    // If user cancelled the popup, rethrow cancellation
    if (gisErr?.message?.includes("closed") || gisErr?.message?.includes("cancel")) {
      throw { code: "auth/popup-closed-by-user", message: "Login cancelado pelo usuário" };
    }
  }

  // Strategy 2: Firebase Popup
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

    const profile: GoogleUserProfile = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    };

    try {
      localStorage.setItem("spottube_google_user_profile", JSON.stringify(profile));
    } catch {}

    return profile;
  } catch (error: any) {
    console.warn("[Firebase Auth] Error signing in with Google Popup:", error);
    
    // If popup was blocked on mobile or in restrictive browser, try redirect
    if ((error?.code === "auth/popup-blocked" || error?.code === "auth/popup-closed-by-user") && useRedirectFallback) {
      const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
      if (isMobile) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return new Promise(() => {}); // Execution will redirect away
        } catch (redirectErr) {
          console.error("[Firebase Auth] Redirect failed:", redirectErr);
        }
      }
    }
    throw error;
  }
}

/**
 * Sign out Google user
 */
export async function logoutGoogle(): Promise<void> {
  try {
    localStorage.removeItem("spottube_google_user_profile");
  } catch {}
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
  // First check if cached in localStorage
  try {
    const stored = localStorage.getItem("spottube_google_user_profile");
    if (stored) {
      const profile = JSON.parse(stored);
      if (profile && profile.uid) {
        callback(profile);
      }
    }
  } catch {}

  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && !user.isAnonymous) {
      const profile: GoogleUserProfile = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      };
      try {
        localStorage.setItem("spottube_google_user_profile", JSON.stringify(profile));
      } catch {}
      callback(profile);
    } else if (!user) {
      const stored = localStorage.getItem("spottube_google_user_profile");
      if (!stored) {
        callback(null);
      }
    }
  });
}

/**
 * Save or update an individual user's playlist in their private collection:
 * /users/{userId}/playlists/{playlistId}
 */
export async function saveUserPlaylistToCloud(userId: string, playlist: SavedPlaylist): Promise<void> {
  const actualUserId = auth.currentUser?.uid || userId;
  const path = `users/${actualUserId}/playlists/${playlist.id}`;
  try {
    await ensureAuthUser();
    const playlistRef = doc(db, "users", actualUserId, "playlists", playlist.id);
    const payload = {
      id: playlist.id,
      userId: actualUserId,
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
  const actualUserId = auth.currentUser?.uid || userId;
  const path = `users/${actualUserId}/playlists/${playlistId}`;
  try {
    await ensureAuthUser();
    const playlistRef = doc(db, "users", actualUserId, "playlists", playlistId);
    await deleteDoc(playlistRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Fetch all private playlists of a specific user
 */
export async function fetchUserCloudPlaylists(userId: string): Promise<SavedPlaylist[]> {
  const actualUserId = auth.currentUser?.uid || userId;
  const path = `users/${actualUserId}/playlists`;
  try {
    await ensureAuthUser();
    const playlistsCol = collection(db, "users", actualUserId, "playlists");
    const q = query(playlistsCol, orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    const playlists: SavedPlaylist[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      playlists.push({
        id: data.id || docSnap.id,
        userId: data.userId || actualUserId,
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
  const actualUserId = auth.currentUser?.uid || userId;
  const path = `users/${actualUserId}/playlists`;
  try {
    const playlistsCol = collection(db, "users", actualUserId, "playlists");
    const q = query(playlistsCol, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const playlists: SavedPlaylist[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          playlists.push({
            id: data.id || docSnap.id,
            userId: data.userId || actualUserId,
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
  const actualUserId = auth.currentUser?.uid || userId;
  const path = `users/${actualUserId}`;
  try {
    await ensureAuthUser();
    const userDoc = doc(db, "users", actualUserId);
    await setDoc(userDoc, { preferences: settings, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.warn("[Firebase] Error saving user settings to cloud:", err);
  }
}

