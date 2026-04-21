import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Lida com o CORS (essencial para o navegador não bloquear a chamada)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Cria o cliente com a Service Role (Chave Mestra)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Validação de quem está chamando (Só aceita se for o Admin do seu app)
    const authHeader = req.headers.get('Authorization')!
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))

    if (authError || !user) throw new Error("Não autorizado")

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleData?.role !== 'admin') throw new Error("Acesso negado: apenas administradores")

    // Pega o que o app enviou
    const { action, user_id, email, password, full_name, phone, role } = await req.json()

    // Lógica: BANIR / DESBANIR
    if (action === 'ban' || action === 'unban') {
      const isBanned = action === 'ban'
      const { error } = await supabaseAdmin.from('profiles').update({ is_banned: isBanned }).eq('id', user_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Lógica: DELETAR CONTA
    if (action === 'delete') {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (error) throw error
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Lógica: CRIAR NOVO USUÁRIO
    if (action === 'create') {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, phone }
      })
      if (createError) throw createError

      if (role === 'admin') {
        await supabaseAdmin.from('user_roles').insert({ user_id: newUser.user.id, role: 'admin' })
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error("Ação não reconhecida")

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})