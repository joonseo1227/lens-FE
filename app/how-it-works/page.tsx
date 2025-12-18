import Header from "@/app/components/Header";

export default function HowItWorks() {
    return (
        <div className="flex min-h-screen flex-col bg-black text-white font-sans selection:bg-blue-500/30">
            <Header/>

            <main className="flex-1 max-w-4xl mx-auto w-full p-6 lg:p-12">
                <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">How
                    It Works</h1>

                <div className="space-y-12 text-zinc-300 leading-relaxed">
                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">WebGL Powered</h2>
                        <p>
                            LensCorrect uses WebGL (Web Graphics Library) to process your images directly in your
                            browser.
                            This allows for hardware-accelerated image manipulation, enabling real-time adjustments
                            without any lag.
                            When you drag a slider, we compile a custom shader program on your device's GPU to transform
                            every pixel instantly.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">100% Local Processing</h2>
                        <p>
                            Traditional online tools upload your images to a remote server, process them, and then send
                            them back.
                            This is slow and raises privacy concerns.
                        </p>
                        <p className="mt-4">
                            <strong>We do things differently.</strong> Your images never leave your device.
                            Everything happens locally within your browser's sandboxed environment.
                        </p>
                        <ul className="list-disc pl-6 mt-4 space-y-2 marker:text-blue-500">
                            <li>No file uploads implies zero waiting time.</li>
                            <li>Your photos remain private and secure on your computer.</li>
                            <li>Works offline once loaded.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">Lens Distortion Correction</h2>
                        <p>
                            We implement a mathematical model for radial distortion correction.
                            <br/>
                            <code>r_new = r_old * (1 + k * r_old^2)</code>
                            <br/>
                            Where <code>k</code> is the distortion coefficient you control with the slider.
                            Positive values correct pincushion distortion, while negative values correct barrel
                            distortion.
                        </p>
                    </section>
                </div>
            </main>

            <footer className="w-full border-t border-zinc-800 py-8 mt-auto bg-black">
                <div className="max-w-7xl mx-auto px-6 text-center text-zinc-600 text-sm">
                    <p>&copy; {new Date().getFullYear()} LensCorrect. Built with Next.js & WebGL.</p>
                </div>
            </footer>
        </div>
    );
}
