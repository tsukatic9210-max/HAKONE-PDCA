import { createClient } from "@supabase/supabase-js";

// Netlifyの環境変数から接続情報を読み込む（ビルド時に埋め込まれる）
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_KEY;

export const dbReady = Boolean(URL && KEY);
const supabase = dbReady ? createClient(URL, KEY) : null;

const ROW_ID = "hakone"; // 共有データは1行にまとめて保存

// 共有データを読み込む
export async function loadShared(){
  if(!supabase) return null;
  const { data, error } = await supabase
    .from("app_state").select("data").eq("id", ROW_ID).single();
  if(error) throw error;
  return data?.data ?? {};
}

// 共有データを保存する（全体を上書き）
export async function saveShared(obj){
  if(!supabase) return;
  const { error } = await supabase
    .from("app_state")
    .update({ data: obj, updated_at: new Date().toISOString() })
    .eq("id", ROW_ID);
  if(error) throw error;
}

// 他の人の更新を検知するため、最終更新時刻だけ取得
export async function fetchUpdatedAt(){
  if(!supabase) return null;
  const { data, error } = await supabase
    .from("app_state").select("updated_at").eq("id", ROW_ID).single();
  if(error) return null;
  return data?.updated_at ?? null;
}
