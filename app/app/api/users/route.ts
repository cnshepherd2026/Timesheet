import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SUPER_ADMIN = "chris.shepherd@jympartnership.co.uk";

// Admin client with service role — can manage users
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function checkAdmin(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  if (session.user.email === SUPER_ADMIN) return session;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
  if (!profile?.is_admin) return null;
  return session;
}

// GET — list all users with emails
export async function GET(req: NextRequest) {
  const session = await checkAdmin(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = data.users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));

  return NextResponse.json({ users });
}

// POST — invite a new user
export async function POST(req: NextRequest) {
  const session = await checkAdmin(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create profile row immediately
  await admin.from("profiles").upsert({ id: data.user.id }, { onConflict: "id", ignoreDuplicates: true });

  return NextResponse.json({ success: true, user: { id: data.user.id, email: data.user.email } });
}

// DELETE — remove a user
export async function DELETE(req: NextRequest) {
  const session = await checkAdmin(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Prevent deleting super admin
  const admin = getAdminClient();
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  if (userData?.user?.email === SUPER_ADMIN) {
    return NextResponse.json({ error: "Cannot delete super admin" }, { status: 403 });
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
