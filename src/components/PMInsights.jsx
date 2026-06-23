export default function PMInsights({ insights, questions }) {
    if (!insights || insights.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-neutral-500">No insights available</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {insights.map((insight, index) => (
                <div key={index} className="group relative">
                    <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8">
                        <div className="flex-shrink-0">
                            <span className="text-4xl md:text-6xl font-display font-black opacity-10">
                                {(index + 1).toString().padStart(2, '0')}
                            </span>
                        </div>
                        <div className="flex-1 pt-0 md:pt-2">
                            <h3 className="text-xl md:text-2xl font-display font-bold uppercase tracking-tight mb-3">
                                {insight.title}
                            </h3>
                            <p className="opacity-80 leading-relaxed text-sm md:text-base max-w-2xl">
                                {insight.description}
                            </p>
                            {insight.source_quote && (
                                <p className="mt-3 text-sm md:text-base italic opacity-60 border-l-4 border-green-800 pl-3 max-w-2xl">
                                    "{insight.source_quote}"
                                </p>
                            )}
                        </div>
                    </div>

                    {index < insights.length - 1 && (
                        <div className="mt-8 border-b border-[#141414]/10"></div>
                    )}
                </div>
            ))}

            {questions && questions.length > 0 && (
                <div className="mt-10 pt-8 border-t-4 border-[#141414]">
                    <h3 className="text-sm uppercase tracking-widest font-bold text-green-800 mb-4">
                        Questions to reflect on
                    </h3>
                    <ul className="space-y-3">
                        {questions.map((q, i) => (
                            <li key={i} className="flex gap-3 items-start text-sm md:text-base leading-relaxed max-w-2xl">
                                <iconify-icon icon="solar:question-circle-bold" width="20" className="text-green-800 flex-shrink-0 mt-1"></iconify-icon>
                                <span>{q}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
