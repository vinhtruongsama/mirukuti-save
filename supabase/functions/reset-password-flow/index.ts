import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { email, user_id } = await req.json()

    if (!email || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Email and User ID are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with admin privileges
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Task 1: Verification
    // Check if email and user_id match in the public.users table (or profiles)
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', user_id)
      .eq('email', email)
      .single()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Thông tin không chính xác' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Task 2: Generate Temporary Password & Update Auth
    // Generate 6-char random string (A-Z, 0-9)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let tempPassword = ''
    for (let i = 0; i < 6; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { 
        password: tempPassword,
        user_metadata: { is_temporary_password: true }
      }
    )

    if (updateError) {
      throw new Error('Không thể cập nhật mật khẩu tạm thời')
    }

    // Task 3: Send Email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured')
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'CLB Quản lý <onboarding@resend.dev>', // Should be a verified domain in production
        to: [email],
        subject: 'Mật khẩu tạm thời cho tài khoản CLB',
        html: `
          <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
            <h2>Chào bạn,</h2>
            <p>Mật khẩu tạm thời của bạn là: <strong style="font-size: 1.2em; color: #007bff; letter-spacing: 2px;">${tempPassword}</strong></p>
            <p>Vui lòng đăng nhập và đổi mật khẩu ngay lập tức để bảo mật tài khoản.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 0.8em; color: #888;">Đây là email tự động, vui lòng không trả lời.</p>
          </div>
        `,
      }),
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      throw new Error('Không thể gửi email mật khẩu tạm thời')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Mật khẩu tạm thời đã được gửi đến email của bạn.' 
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Lỗi hệ thống' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
