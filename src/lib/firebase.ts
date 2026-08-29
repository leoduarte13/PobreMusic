import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, onSnapshot, query, orderBy, getDocFromServer } from "firebase/firestore";
import { getAuth, signInWithPopup, signInWithRedirect, setPersistence, browserLocalPersistence, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { SavedPlaylist, GoogleUserProfile, EqualizerState } from "../types";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || "(default)");
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export enum OperationType { CREATE="create", UPDATE="update", DELETE="delete", LIST="list", GET="get", WRITE="write" }
export interface FirestoreErrorInfo { error:string; operationType:OperationType; path:string|null; authInfo:any }

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) {
    const raw = error.message;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error) {
        const code = parsed.error.code ? ` (${parsed.error.code})` : "";
        const auth = parsed.authInfo;
        if (/permission-denied|insufficient permissions/i.test(String(parsed.error.code || parsed.error.message || parsed.error))) {
          return `Permissão do Firestore negada${code}. Usuário autenticado: ${auth?.uid ? "sim" : "não"}. Verifique se as regras do Firestore publicadas são as do projeto PobreMusic.`;
        }
        return String(parsed.error.message || parsed.error || "Erro do Firestore") + code;
      }
    } catch {}
    return raw;
  }
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e:any = error;
    if (e.code === "permission-denied" || e.code === "failed-precondition") return `${e.code}: ${e.message || "Firestore recusou a operação."}`;
    return String(e?.message || e?.error || e?.code || (() => { try { return JSON.stringify(e); } catch { return "Erro desconhecido"; } })());
  }
  return "Erro desconhecido.";
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const raw:any = error instanceof Error ? error : error;
  const info = {
    error: { code: raw?.code || "unknown", message: raw?.message || readableError(error) },
    authInfo: { userId: auth.currentUser?.uid || null, email: auth.currentUser?.email || null, emailVerified: auth.currentUser?.emailVerified ?? null, isAnonymous: auth.currentUser?.isAnonymous ?? null, providerInfo: auth.currentUser?.providerData || [] },
    operationType,
    path
  };
  throw new Error(JSON.stringify(info));
}

function stripUndefined(value:any):any {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const out:any = {};
    for (const [k,v] of Object.entries(value)) if (v !== undefined) out[k] = stripUndefined(v);
    return out;
  }
  return value;
}

testFirestoreConnection();
export async function testFirestoreConnection(){try{await getDocFromServer(doc(db,"test","connection"));}catch{}}

export function formatAuthErrorMessage(error:any){
  const currentDomain=typeof window!=="undefined"?window.location.hostname:"";const code=error?.code||"";
  if(code==="auth/unauthorized-domain")return{title:"Domínio não autorizado no Firebase",message:`Adicione ${currentDomain} em Firebase > Authentication > Settings > Authorized domains.`,isDomainError:true,currentDomain};
  if(code==="auth/popup-blocked")return{title:"Pop-up bloqueado",message:"O navegador bloqueou a janela. Será usado o redirecionamento do Google.",isDomainError:false,currentDomain};
  return{title:"Erro ao conectar com Google",message:readableError(error),isDomainError:false,currentDomain};
}

async function persistGoogleUser(user:User):Promise<GoogleUserProfile>{
  const profile={uid:user.uid,displayName:user.displayName,email:user.email,photoURL:user.photoURL} as GoogleUserProfile;
  try{await setDoc(doc(db,"users",user.uid),{id:user.uid,email:user.email||"",displayName:user.displayName||"Usuário",photoURL:user.photoURL||"",lastLogin:Date.now()},{merge:true});}catch(e){console.warn("[Firebase] profile write",e)}
  try{localStorage.setItem("spottube_google_user_profile",JSON.stringify(profile));}catch{}
  return profile;
}

export async function checkRedirectAuthResult():Promise<GoogleUserProfile|null>{
  try{await setPersistence(auth,browserLocalPersistence);const result=await getRedirectResult(auth);if(result?.user)return persistGoogleUser(result.user);}catch(e){console.warn("[Firebase] redirect result",e)}
  try{const stored=localStorage.getItem("spottube_google_user_profile");if(stored){const profile=JSON.parse(stored);if(profile?.uid)return profile;}}catch{}
  return null;
}

export async function signInWithGoogle(useRedirectFallback=true):Promise<GoogleUserProfile>{
  await setPersistence(auth,browserLocalPersistence);
  const isMobile=typeof navigator!=="undefined"&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(isMobile){await signInWithRedirect(auth,googleProvider);return new Promise(()=>{});}
  try{const result=await signInWithPopup(auth,googleProvider);return persistGoogleUser(result.user);}catch(error:any){console.warn("[Firebase] popup login",error);if(useRedirectFallback&&["auth/popup-blocked","auth/popup-closed-by-user","auth/cancelled-popup-request"].includes(error?.code)){await signInWithRedirect(auth,googleProvider);return new Promise(()=>{});}throw error;}
}

export async function logoutGoogle(){try{localStorage.removeItem("spottube_google_user_profile");}catch{}await signOut(auth);}
export function subscribeToAuth(callback:(user:GoogleUserProfile|null)=>void){try{const stored=localStorage.getItem("spottube_google_user_profile");if(stored)callback(JSON.parse(stored));}catch{}return onAuthStateChanged(auth,user=>{if(user&&!user.isAnonymous){persistGoogleUser(user).then(callback).catch(()=>callback({uid:user.uid,displayName:user.displayName,email:user.email,photoURL:user.photoURL}));}else if(!user&&!localStorage.getItem("spottube_google_user_profile")){callback(null);}})}

export async function saveUserPlaylistToCloud(userId:string,p:SavedPlaylist){const id=auth.currentUser?.uid||userId;if(!id)throw new Error("Faça login com Google antes de salvar a playlist.");if(!p?.id)throw new Error("A playlist não possui um ID válido.");if(!p?.name?.trim())throw new Error("A playlist precisa ter um nome.");const payload=stripUndefined({...p,userId:id,name:p.name.trim().slice(0,150),description:(p.description||"").slice(0,500),cover:(p.cover||"").slice(0,2000),tracks:Array.isArray(p.tracks)?p.tracks.slice(0,500):[],updatedAt:Date.now(),isCloud:true});try{await setDoc(doc(db,"users",id,"playlists",String(p.id)),payload,{merge:true});}catch(e){handleFirestoreError(e,OperationType.WRITE,`users/${id}/playlists/${p.id}`)}}
export async function deleteUserPlaylistFromCloud(userId:string,playlistId:string){const id=auth.currentUser?.uid||userId;try{await deleteDoc(doc(db,"users",id,"playlists",playlistId));}catch(e){handleFirestoreError(e,OperationType.DELETE,`users/${id}/playlists/${playlistId}`)}}
export async function fetchUserCloudPlaylists(userId:string){const id=auth.currentUser?.uid||userId;try{const snapshot=await getDocs(query(collection(db,"users",id,"playlists"),orderBy("updatedAt","desc")));return snapshot.docs.map(x=>({id:x.data().id||x.id,userId:x.data().userId||id,name:x.data().name||"Playlist Sem Nome",description:x.data().description||"",cover:x.data().cover||"",tracks:Array.isArray(x.data().tracks)?x.data().tracks:[],createdAt:x.data().createdAt||Date.now(),updatedAt:x.data().updatedAt||Date.now(),isCloud:true})) as SavedPlaylist[]}catch(e){handleFirestoreError(e,OperationType.LIST,`users/${id}/playlists`)}}
export function subscribeToUserCloudPlaylists(userId:string,callback:(p:SavedPlaylist[])=>void,onError?:(e:Error)=>void){const id=auth.currentUser?.uid||userId;try{const q=query(collection(db,"users",id,"playlists"),orderBy("updatedAt","desc"));return onSnapshot(q,snapshot=>callback(snapshot.docs.map(x=>({...x.data(),id:x.data().id||x.id,userId:id}) as SavedPlaylist)),error=>onError?.(error as Error));}catch(e){onError?.(e as Error);return()=>{}}}
export async function saveUserSettingsToCloud(userId:string,settings:{equalizer?:EqualizerState;volume?:number;shuffle?:boolean;repeatMode?:string;lastPlaylistId?:string}){const id=auth.currentUser?.uid||userId;try{await setDoc(doc(db,"users",id),{preferences:settings,updatedAt:Date.now()},{merge:true});}catch{}}
