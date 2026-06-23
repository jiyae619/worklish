import { motion } from 'motion/react'

export default function LoadingAnalysis({ message = 'Preparing analysis...' }) {
    return (
        <div className="min-h-screen flex flex-col justify-between p-6 md:p-12 font-sans text-[#141414] overflow-hidden relative">
            {/* Top area */}
            <div className="flex justify-between items-start z-10">
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="font-medium text-sm md:text-base uppercase tracking-widest border-b border-[#141414]/30 pb-2 flex gap-3 items-center"
                    >
                        <span>STATUS</span>
                        <span className="w-1.5 h-1.5 bg-green-800 animate-pulse"></span>
                        <span className="opacity-80">{message}</span>
                    </motion.div>
                )}
            </div>

            {/* Center massive typography & SVG */}
            <div className="flex-1 flex flex-col items-center justify-center relative">
                {/* Spinning SVG strictly in the background */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                    <svg
                        className="w-[60vw] h-[60vw] md:w-[30vw] md:h-[30vw] min-w-[300px] opacity-[0.05] animate-[spin_20s_linear_infinite] text-[#141414]"
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
                    </svg>
                </motion.div>

                {/* Massive Typography */}
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="text-[6vw] md:text-[4vw] leading-[0.85] font-display font-black tracking-tight uppercase m-0 text-center relative z-10"
                >
                    Analyzing<br />Video
                </motion.h2>

                {/* Blinking indicator grid */}
                <div className="mt-16 flex gap-3 items-center z-10">
                    <div className="w-3 h-3 bg-[#141414] animate-pulse"></div>
                    <div className="w-3 h-3 bg-green-800 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-3 h-3 bg-green-800 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
            </div>

            {/* Bottom info */}
            <div className="flex justify-between items-end border-t border-[#141414]/30 pt-4 mt-auto z-10">
                <p className="text-xs font-medium uppercase tracking-widest opacity-60">
                    Est. Time: 30-60s
                </p>
                <div className="text-xs font-medium uppercase tracking-widest flex flex-col items-end opacity-60">
                    <span>Extracting Insights</span>
                    <span>& English Expressions</span>
                </div>
            </div>
        </div>
    )
}
