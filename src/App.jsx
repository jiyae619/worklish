import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import Results from './components/Results'
import LoadingAnalysis from './components/LoadingAnalysis'
import NotionCallback from './components/NotionCallback'

const API_URL = import.meta.env.VITE_API_URL || ''

function App() {
  const [youtubeLink, setYoutubeLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!youtubeLink.trim()) {
      setError('Please enter a YouTube URL')
      return
    }

    setLoading(true)
    setLoadingMessage('Fetching transcript from YouTube...')
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          youtube_url: youtubeLink
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed')
      }

      if (data.success) {
        setAnalysisData(data)
      } else {
        throw new Error(data.error || 'Analysis failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  const handleSeek = (timestamp) => {
    const videoId = extractVideoId(youtubeLink)
    if (videoId) {
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp)}s`
      window.open(youtubeUrl, '_blank')
    }
  }

  const extractVideoId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  if (window.location.pathname === '/notion-callback') {
    return <NotionCallback />
  }

  if (loading) {
    return <LoadingAnalysis message={loadingMessage} />
  }

  if (analysisData) {
    return (
      <Results
        data={analysisData}
        onBack={() => {
          setAnalysisData(null)
          setYoutubeLink('')
        }}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col justify-between p-6 md:p-12 font-sans transition-colors duration-500 text-[#141414]">
      {/* Top Section */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-8">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-[14vw] md:text-[10vw] leading-[0.85] font-display font-black tracking-normal uppercase m-0"
        >
          Work
        </motion.h1>
      </div>

      {/* Middle Section - URL Input */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto my-16 z-10"
      >
        <form
          onSubmit={handleSubmit}
          className="w-full relative group"
        >
          <input
            id="youtube-url"
            type="url"
            value={youtubeLink}
            onChange={(e) => setYoutubeLink(e.target.value)}
            placeholder="ENTER YOUTUBE URL..."
            className="w-full bg-transparent border-b-4 border-[#141414] text-lg md:text-xl py-4 md:py-8 outline-none placeholder:text-[#141414]/30 tracking-normal uppercase transition-all focus:border-green-800"
            disabled={loading}
            required
          />
          <button
            type="submit"
            disabled={!youtubeLink.trim() || loading}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-14 h-14 md:w-24 md:h-24 bg-[#141414] text-[#E4E3E0] rounded-full flex items-center justify-center hover:bg-green-800 hover:text-white transition-colors group-focus-within:bg-green-800 group-focus-within:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRight className="w-8 h-8 md:w-12 md:h-12" />
          </button>
        </form>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 w-full text-center"
          >
            <p className="text-red-600 font-bold text-sm tracking-widest uppercase">{error}</p>
          </motion.div>
        )}
      </motion.div>

      {/* Bottom Section */}
      <div className="flex flex-col-reverse md:flex-row justify-between items-end gap-8 relative">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="max-w-sm text-lg md:text-xl font-medium leading-snug text-justify md:pb-4"
        >
          Learn Insights & Advanced English from YouTube Videos
        </motion.div>

        <div className="relative">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="text-[14vw] md:text-[10vw] leading-[0.85] font-display font-black tracking-normal uppercase m-0 text-right"
          >
            English
          </motion.h1>

          {/* Decorative SVG */}
          <motion.svg
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 0.7, rotate: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute -top-16 -left-8 md:-top-24 md:-left-16 w-20 h-20 md:w-32 md:h-32 animate-[spin_15s_linear_infinite] pointer-events-none text-green-800"
            viewBox="0 0 68 68"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g stroke="currentColor" strokeWidth="1">
              <path d="M34 0V68"></path>
              <path d="M68 34H0"></path>
              <path d="M25.2876 1.13379L42.706 66.865"></path>
              <path d="M66.8651 25.2908L1.13477 42.7092"></path>
              <path d="M43.0516 1.22656L24.9492 66.7736"></path>
              <path d="M66.7736 43.0512L1.22656 24.9487"></path>
              <path d="M51.4533 4.81885L16.5557 63.1812"></path>
              <path d="M63.1821 51.4489L4.81982 16.5513"></path>
              <path d="M58.0607 9.9751L9.94385 58.0248"></path>
              <path d="M58.0228 58.0585L9.97314 9.94165"></path>
              <path d="M63.1397 16.4749L4.86816 51.524"></path>
              <path d="M51.5228 63.1358L16.4736 4.86426"></path>
            </g>
          </motion.svg>
        </div>
      </div>
    </div>
  )
}

export default App
