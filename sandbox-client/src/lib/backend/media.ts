import type { SupabaseClient } from "@supabase/supabase-js";

export async function signVideoUrls(
  adminClient: SupabaseClient,
  videos: Array<Record<string, unknown>>
) {
  return Promise.all(
    videos.map(async (video) => {
      const path = typeof video.url === "string" ? video.url : "";
      if (!path || path.startsWith("http")) return video;

      const { data } = await adminClient.storage.from("sandbox-videos").createSignedUrl(path, 3600);
      return {
        ...video,
        url: data?.signedUrl ?? path,
      };
    })
  );
}
