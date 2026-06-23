import { useEffect, useState, useRef } from 'react'

export default function NotionCallback() {
    const [status, setStatus] = useState('Authenticating with Notion...')
    const API_URL = import.meta.env.VITE_API_URL || ''
    const hasExchanged = useRef(false)

    useEffect(() => {
        if (hasExchanged.current) return
        hasExchanged.current = true

        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')
        const error = urlParams.get('error')

        if (error) {
            setStatus(`Authentication Failed: ${error}`)
            setTimeout(() => { window.location.href = '/' }, 3000)
            return
        }

        if (!code) {
            setStatus('Error: No authorization code provided.')
            setTimeout(() => { window.location.href = '/' }, 3000)
            return
        }

        const exchangeCode = async () => {
            try {
                const redirectUri = window.location.origin + '/notion-callback';

                const response = await fetch(`${API_URL}/api/notion/auth`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, redirect_uri: redirectUri })
                })

                const data = await response.json()

                if (data.success) {
                    localStorage.setItem('notion_access_token', data.access_token)
                    if (data.workspace_name) {
                        localStorage.setItem('notion_workspace_name', data.workspace_name)
                    }
                    setStatus('Authentication successful! Returning to app...')
                    setTimeout(() => { window.location.href = '/' }, 1500)
                } else {
                    setStatus(`Error: ${data.error}`)
                    setTimeout(() => { window.location.href = '/' }, 3000)
                }
            } catch (err) {
                setStatus('Error connecting to authentication server.')
                setTimeout(() => { window.location.href = '/' }, 3000)
            }
        }

        exchangeCode()
    }, [API_URL])

    return (
        <div className="min-h-screen font-sans bg-[#E4E3E0] flex items-center justify-center p-6 text-[#141414]">
            <div className="w-full max-w-md p-8 md:p-12 border-4 border-[#141414] text-center">
                <svg className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-8 animate-[spin_3s_linear_infinite] text-green-800" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g stroke="currentColor" strokeWidth="2">
                        <path d="M34 0V68"></path>
                        <path d="M68 34H0"></path>
                        <path d="M25.2876 1.13379L42.706 66.865"></path>
                        <path d="M66.8651 25.2908L1.13477 42.7092"></path>
                        <path d="M43.0516 1.22656L24.9492 66.7736"></path>
                        <path d="M66.7736 43.0512L1.22656 24.9487"></path>
                    </g>
                </svg>
                <h1 className="text-2xl md:text-3xl font-display font-black uppercase tracking-tight mb-4">
                    Notion Connection
                </h1>
                <p className="font-bold opacity-70 tracking-widest uppercase text-sm">
                    {status}
                </p>
            </div>
        </div>
    )
}
