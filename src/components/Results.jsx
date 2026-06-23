import { useState, useRef, useEffect } from 'react'
import PMInsights from './PMInsights'
import EnglishExpressions from './EnglishExpressions'

export default function Results({ data, onBack }) {
    const [activeTab, setActiveTab] = useState('insights')
    const [isExporting, setIsExporting] = useState(false)
    const [exportError, setExportError] = useState(null)
    const [notionUrl, setNotionUrl] = useState(null)
    
    // New state for Notion Page Selection
    const [showNotionModal, setShowNotionModal] = useState(false)
    const [notionPages, setNotionPages] = useState([])
    const [isLoadingPages, setIsLoadingPages] = useState(false)
    
    const playerRef = useRef(null)
    const API_URL = import.meta.env.VITE_API_URL || ''

    // YouTube Player API integration
    useEffect(() => {
        const initializePlayer = () => {
            if (window.YT && window.YT.Player) {
                playerRef.current = new window.YT.Player('youtube-player', {
                    videoId: data.video.id,
                    playerVars: {
                        autoplay: 0,
                        modestbranding: 1,
                        rel: 0
                    }
                })
            }
        }

        // Check if API is already loaded
        if (window.YT && window.YT.Player) {
            initializePlayer()
        } else {
            // Load YouTube IFrame API if not already loaded
            if (!window.YT) {
                const tag = document.createElement('script')
                tag.src = 'https://www.youtube.com/iframe_api'
                const firstScriptTag = document.getElementsByTagName('script')[0]
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
            }

            // Set callback for when API is ready
            window.onYouTubeIframeAPIReady = initializePlayer
        }

        return () => {
            // Cleanup
            if (playerRef.current && playerRef.current.destroy) {
                playerRef.current.destroy()
            }
        }
    }, [data.video.id])

    const handleTimestampClick = (seconds) => {
        if (playerRef.current && playerRef.current.seekTo) {
            playerRef.current.seekTo(seconds, true)
            playerRef.current.playVideo()
        }
    }

    const handleExportToNotion = async () => {
        setExportError(null)
        setNotionUrl(null)

        const accessToken = localStorage.getItem('notion_access_token')

        if (!accessToken) {
            // First-time connection: redirect to Notion OAuth
            const clientId = import.meta.env.VITE_NOTION_CLIENT_ID
            const redirectUri = encodeURIComponent(window.location.origin + '/notion-callback')
            window.location.href = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${redirectUri}`
            return
        }

        // If a destination is already configured, save straight to it (no page picker)
        const savedPageId = localStorage.getItem('notion_page_id')
        if (savedPageId) {
            executeExport(savedPageId)
            return
        }

        // First time after connecting: pick a destination once
        setShowNotionModal(true)
        fetchNotionPages(accessToken)
    }

    const handleChangeNotionDestination = () => {
        const accessToken = localStorage.getItem('notion_access_token')
        if (!accessToken) return handleExportToNotion()
        localStorage.removeItem('notion_page_id')
        localStorage.removeItem('notion_page_title')
        setNotionUrl(null)
        setExportError(null)
        setShowNotionModal(true)
        fetchNotionPages(accessToken)
    }

    const fetchNotionPages = async (accessToken) => {
        setIsLoadingPages(true)
        setExportError(null)
        
        try {
            const response = await fetch(`${API_URL}/api/notion/pages`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            const result = await response.json()

            if (!response.ok) {
                if (response.status === 401) {
                    handleDisconnectNotion()
                    throw new Error('Notion access revoked or expired. Please reconnect.')
                }
                throw new Error(result.error || 'Failed to fetch Notion pages')
            }

            if (result.success) {
                setNotionPages(result.pages || [])
            }
        } catch (err) {
            setExportError(err.message)
            setShowNotionModal(false)
        } finally {
            setIsLoadingPages(false)
        }
    }

    const handleDisconnectNotion = () => {
        localStorage.removeItem('notion_access_token')
        localStorage.removeItem('notion_workspace_name')
        localStorage.removeItem('notion_page_id')
        localStorage.removeItem('notion_page_title')
        setNotionPages([])
        setShowNotionModal(false)
        // Force a re-render to update the button state
        setNotionUrl(null)
    }

    const executeExport = async (pageId) => {
        setIsExporting(true)
        setExportError(null)
        setShowNotionModal(false)

        const accessToken = localStorage.getItem('notion_access_token')

        try {
            const response = await fetch(`${API_URL}/api/export/notion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    analysis_data: data,
                    access_token: accessToken,
                    page_id: pageId
                })
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Export failed')
            }

            if (result.success) {
                setNotionUrl(result.notion_url)
            } else {
                if (response.status === 401) {
                    handleDisconnectNotion()
                    throw new Error('Notion access revoked or expired. Please reconnect.')
                }
                throw new Error(result.error || 'Export failed')
            }
        } catch (err) {
            setExportError(err.message)
        } finally {
            setIsExporting(false)
        }
    }

    const hasNotionToken = !!localStorage.getItem('notion_access_token')
    const hasNotionPage = !!localStorage.getItem('notion_page_id')

    return (
        <div className="min-h-screen flex flex-col font-sans transition-colors duration-500 text-[#141414] bg-[#E4E3E0]">
            {/* Header */}
            <nav className="border-b-4 border-[#141414]">
                <div className="px-6 md:px-12 py-6 flex items-center justify-between">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-[#141414] hover:text-green-800 transition-colors uppercase font-bold tracking-widest text-sm"
                    >
                        <iconify-icon icon="solar:arrow-left-linear" width="24"></iconify-icon>
                        <span>Back to Start</span>
                    </button>
                    <h1 className="text-3xl md:text-5xl font-display font-black uppercase tracking-tight m-0">
                        Work × English
                    </h1>
                    <div className="flex items-center gap-4">
                        {hasNotionToken && hasNotionPage && !notionUrl && (
                            <button
                                onClick={handleChangeNotionDestination}
                                title={`Saving to: ${localStorage.getItem('notion_page_title') || 'Notion'}`}
                                className="hidden md:inline text-xs uppercase tracking-widest font-bold opacity-50 hover:opacity-100 hover:text-green-800 transition-colors"
                            >
                                Change folder
                            </button>
                        )}
                        {notionUrl ? (
                            <a
                                href={notionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-green-800 font-bold uppercase tracking-widest text-sm hover:opacity-70 transition-opacity"
                            >
                                <iconify-icon icon="solar:check-circle-bold" width="24"></iconify-icon>
                                <span>Saved</span>
                            </a>
                        ) : (
                            <button
                                onClick={handleExportToNotion}
                                disabled={isExporting}
                                className={`flex items-center gap-2 font-bold uppercase tracking-widest text-sm transition-all ${isExporting
                                    ? 'text-[#141414]/40 cursor-not-allowed'
                                    : 'text-[#141414] hover:text-green-800'
                                    }`}
                            >
                                {isExporting ? (
                                    <>
                                        <iconify-icon icon="solar:refresh-linear" width="24" className="animate-spin"></iconify-icon>
                                        <span>Saving</span>
                                    </>
                                ) : (
                                    <>
                                        <iconify-icon icon="solar:database-bold" width="24"></iconify-icon>
                                        <span>{hasNotionToken ? "Save to Notion" : "Connect to Notion"}</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
                {exportError && (
                    <div className="bg-[#141414] text-[#E4E3E0] px-6 md:px-12 py-2">
                        <p className="text-xs uppercase tracking-widest font-bold text-center">
                            Failed to export: {exportError}
                        </p>
                    </div>
                )}
            </nav>

            {/* Main Content Grid */}
            <main className="flex-1 flex flex-col lg:flex-row">
                {/* Left Column: Video Player & Info */}
                <div className="w-full lg:w-5/12 border-b-4 lg:border-b-0 lg:border-r-4 border-[#141414] flex flex-col">
                    <div className="sticky top-0">
                        {/* Video Info Header */}
                        <div className="p-6 md:p-12 border-b-4 border-[#141414]">
                            <h2 className="text-2xl md:text-4xl font-display font-black uppercase leading-tight tracking-tight mb-4" title={data.video?.title || "Analysis Complete"}>
                                {data.video?.title || "Analysis Complete"}
                            </h2>
                            {data.summary ? (
                                <p className="text-sm md:text-base opacity-80 leading-relaxed max-w-md">
                                    {data.summary}
                                </p>
                            ) : (
                                <p className="text-sm md:text-base opacity-70 uppercase tracking-widest font-medium max-w-sm">
                                    Review insights and learn vocabulary. Click timestamps to jump to specific points.
                                </p>
                            )}
                        </div>

                        {/* YouTube Player Wrapper */}
                        <div className="bg-[#141414] aspect-video w-full">
                            <div id="youtube-player" className="w-full h-full"></div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Analysis */}
                <div className="w-full lg:w-7/12 flex flex-col">
                    {/* Massive Tabs */}
                    <div className="grid grid-cols-2 border-b-4 border-[#141414]">
                        <button
                            onClick={() => setActiveTab('insights')}
                            className={`p-4 md:p-6 font-display font-black uppercase text-xl md:text-2xl text-left border-r-4 border-[#141414] transition-colors leading-[0.85] ${activeTab === 'insights'
                                ? 'bg-green-800 text-[#E4E3E0]'
                                : 'bg-transparent text-[#141414] hover:bg-[#141414]/5'
                                }`}
                        >
                            <span className="opacity-50 text-sm md:text-base block mb-1">01.</span>
                            Insights
                        </button>
                        <button
                            onClick={() => setActiveTab('expressions')}
                            className={`p-4 md:p-6 font-display font-black uppercase text-xl md:text-2xl text-left transition-colors leading-[0.85] ${activeTab === 'expressions'
                                ? 'bg-green-800 text-[#E4E3E0]'
                                : 'bg-transparent text-[#141414] hover:bg-[#141414]/5'
                                }`}
                        >
                            <span className="opacity-50 text-sm md:text-base block mb-1">02.</span>
                            English<br />Expressions
                        </button>
                    </div>

                    {/* Tab Content Area */}
                    <div className="p-6 md:p-12 flex-1">
                        {activeTab === 'insights' ? (
                            <PMInsights insights={data.pm_insights} questions={data.pm_questions} />
                        ) : (
                            <EnglishExpressions
                                expressions={data.english_expressions}
                                onTimestampClick={handleTimestampClick}
                            />
                        )}
                    </div>
                </div>
            </main>

            {/* Notion Page Selection Modal */}
            {showNotionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141414]/80 backdrop-blur-sm p-6">
                    <div className="bg-[#E4E3E0] border-4 border-[#141414] w-full max-w-lg flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between p-6 border-b-4 border-[#141414]">
                            <h3 className="text-xl md:text-2xl font-display font-black uppercase m-0">
                                Save to Notion
                            </h3>
                            <button 
                                onClick={() => setShowNotionModal(false)}
                                className="text-[#141414] hover:text-green-800 transition-colors"
                            >
                                <iconify-icon icon="solar:close-circle-bold" width="32"></iconify-icon>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1">
                            <p className="uppercase tracking-widest font-bold text-sm mb-4 opacity-70">
                                Select a page to save this analysis
                            </p>
                            
                            {isLoadingPages ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <iconify-icon icon="solar:refresh-linear" width="48" className="animate-spin text-green-800 mb-4"></iconify-icon>
                                    <p className="uppercase font-bold tracking-widest text-sm">Loading pages...</p>
                                </div>
                            ) : notionPages.length > 0 ? (
                                <div className="flex flex-col gap-3">
                                    {notionPages.map(page => (
                                        <button
                                            key={page.id}
                                            onClick={() => {
                                                localStorage.setItem('notion_page_id', page.id)
                                                localStorage.setItem('notion_page_title', page.title)
                                                executeExport(page.id)
                                            }}
                                            className="w-full text-left p-4 border-2 border-[#141414] hover:bg-green-800 hover:text-[#E4E3E0] hover:border-green-800 transition-colors flex items-center gap-3 group"
                                        >
                                            <iconify-icon icon="solar:document-text-linear" width="24" className="text-[#141414] group-hover:text-[#E4E3E0]"></iconify-icon>
                                            <span className="font-bold text-lg truncate flex-1">{page.title}</span>
                                            <iconify-icon icon="solar:arrow-right-linear" width="20" className="opacity-0 group-hover:opacity-100 transition-opacity"></iconify-icon>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="font-bold mb-2">No pages found.</p>
                                    <p className="text-sm opacity-70">Please ensure you granted access to pages during Notion setup.</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-6 border-t-4 border-[#141414] bg-[#141414]/5 flex justify-between items-center">
                            <span className="text-sm font-bold opacity-70">
                                Connected as: {localStorage.getItem('notion_workspace_name') || 'Notion User'}
                            </span>
                            <button
                                onClick={handleDisconnectNotion}
                                className="text-red-600 hover:text-red-800 uppercase tracking-widest font-bold text-sm flex items-center gap-1 transition-colors"
                            >
                                <iconify-icon icon="solar:logout-2-bold" width="18"></iconify-icon>
                                Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
