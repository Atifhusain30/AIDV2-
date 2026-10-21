import { vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', process.env.VITE_SUPABASE_URL || 'https://example.supabase.co')
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_test_key')
vi.stubEnv('VITE_API_URL', process.env.VITE_API_URL || 'http://127.0.0.1:3001')
