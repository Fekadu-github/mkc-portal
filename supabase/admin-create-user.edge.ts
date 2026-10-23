// Deploy this file as: supabase/functions/admin-create-user/index.ts
// It must run as a Supabase Edge Function; do not put a service-role key in portal.js.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const roles = new Set(['super_admin','secretary','pastor','department_user','viewer']);
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{...corsHeaders,'Content-Type':'application/json'}});

Deno.serve(async (request: Request) => {
  if(request.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(request.method!=='POST') return reply({error:'Method not allowed.'},405);
  const url=Deno.env.get('SUPABASE_URL')??'';
  const publicKey=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
  const token=request.headers.get('Authorization');
  if(!url||!publicKey||!serviceKey||!token) return reply({error:'Function configuration or session is missing.'},401);

  const callerClient=createClient(url,publicKey,{global:{headers:{Authorization:token}}});
  const {data:{user:caller},error:callerError}=await callerClient.auth.getUser();
  if(callerError||!caller) return reply({error:'Your sign-in session is invalid.'},401);
  const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:callerProfile,error:profileError}=await admin.from('profiles').select('role,active').eq('id',caller.id).maybeSingle();
  if(profileError||!callerProfile?.active||callerProfile.role!=='super_admin') return reply({error:'Only Super Admins can create portal users.'},403);

  const input=await request.json().catch(()=>null);
  const full_name=String(input?.full_name??'').trim(),email=String(input?.email??'').trim().toLowerCase(),password=String(input?.password??''),role=String(input?.role??'viewer'),department_id=input?.department_id||null;
  if(!full_name||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||!roles.has(role)) return reply({error:'Enter a full name, valid email, password of at least 8 characters, and valid role.'},400);
  if(role==='department_user'&&!department_id) return reply({error:'Department users must be assigned a department.'},400);

  const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name}});
  if(createError||!created.user) return reply({error:createError?.message??'Could not create the user.'},400);
  const {error:saveError}=await admin.from('profiles').upsert({id:created.user.id,full_name,role,department_id:department_id||null,active:true});
  if(saveError){await admin.auth.admin.deleteUser(created.user.id);return reply({error:`User was not created: ${saveError.message}`},400);}
  return reply({id:created.user.id,email,full_name,role,department_id:department_id||null},201);
});
