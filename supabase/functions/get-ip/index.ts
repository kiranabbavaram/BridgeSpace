import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Helper function to get IST timestamp in ISO 8601 format
function getISTTimestamp(): string {
  const date = new Date();

  // Add 5 hours and 30 minutes to UTC to get IST
  const istTime = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);

  // Format as ISO string with +05:30 timezone
  return istTime.toISOString().replace("Z", "+05:30");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get IP from request headers
    const clientIP =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "0.0.0.0";

    // Create a Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate network prefix
    const networkPrefix = clientIP.split(".").slice(0, 3).join(".");

    // Check if this IP exists in the database
    const { data: existingIP, error: fetchError } = await supabase
      .from("network_connections")
      .select("*")
      .eq("ip_address", clientIP)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching IP:", fetchError);
    }

    // Update or insert the IP
    if (existingIP) {
      // Update last active timestamp in IST
      const istTimestamp = getISTTimestamp();
      const { error: updateError } = await supabase
        .from("network_connections")
        .update({ last_active: istTimestamp })
        .eq("id", existingIP.id);

      if (updateError) {
        console.error("Error updating IP record:", updateError);
      }
    } else {
      // Insert new IP record with IST timestamp
      const istTimestamp = getISTTimestamp();
      const { error: insertError } = await supabase
        .from("network_connections")
        .insert({
          ip_address: clientIP,
          network_prefix: networkPrefix,
          created_at: istTimestamp,
          last_active: istTimestamp,
        });

      if (insertError) {
        console.error("Error inserting IP record:", insertError);
      }
    }

    // Return the IP and network prefix to the client
    return new Response(
      JSON.stringify({
        ip: clientIP,
        networkPrefix,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Unexpected error:", error);

    return new Response(JSON.stringify({ error: "Failed to get IP address" }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
