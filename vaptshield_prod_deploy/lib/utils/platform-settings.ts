import { getServerClient } from "@/lib/supabase/server"

/**
 * Z+ UTILITY: Fetch a platform setting value from the database.
 * This is the primary way to enforce Super Admin configurations across the app.
 */
export async function getPlatformSetting(key: string, defaultValue: string = ""): Promise<string> {
  try {
    const supabase = await getServerClient()
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle()

    if (error || !data) return defaultValue
    return data.value
  } catch (err) {
    console.error(`Error fetching platform setting ${key}:`, err)
    return defaultValue
  }
}

/**
 * Bulk fetch platform settings for critical paths like middleware or init.
 */
export async function getPlatformSettingsMap(): Promise<Record<string, string>> {
    try {
        const supabase = await getServerClient()
        const { data, error } = await supabase
          .from("platform_settings")
          .select("key, value")
    
        if (error || !data) return {}
        
        return data.reduce((acc, curr) => ({
            ...acc,
            [curr.key]: curr.value
        }), {})
      } catch (err) {
        console.error("Error fetching platform settings map:", err)
        return {}
      }
}
