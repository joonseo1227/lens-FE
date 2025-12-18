import Header from "./components/Header";
import LensCorrector from "./components/LensCorrector";

export default function Home() {
    return (
        <div className="flex min-h-screen flex-col bg-black text-white font-sans selection:bg-blue-500/30">
            <Header/>

            <main className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-hidden">
                {/* Background Gradients */}
                <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-600/20 rounded-[50%] blur-[120px] -z-10 opacity-50 pointer-events-none"/>
                <div
                    className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-indigo-600/10 rounded-[50%] blur-[100px] -z-10 opacity-30 pointer-events-none"/>

                <div className="text-center mb-10 max-w-2xl mx-auto">
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-400">
                        Fix Lens Distortion Instantly
                    </h2>
                    <p className="text-lg text-zinc-400">
                        Correct barrel and pincushion distortion with professional-grade WebGL processing.
                        Everything runs 100% locally in your browser.
                    </p>
                </div>

                <LensCorrector/>

            </main>

            <footer className="w-full border-t border-zinc-800 py-8 mt-auto bg-black">
                <div className="max-w-7xl mx-auto px-6 text-center text-zinc-600 text-sm">
                    <p>&copy; {new Date().getFullYear()} LensCorrect. Built with Next.js & WebGL.</p>
                </div>
            </footer>
        </div>
    );
}
