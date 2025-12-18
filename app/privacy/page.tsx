import Header from "@/app/components/Header";

export default function PrivacyPolicy() {
    return (
        <div className="flex min-h-screen flex-col bg-black text-white font-sans selection:bg-blue-500/30">
            <Header/>

            <main className="flex-1 max-w-4xl mx-auto w-full p-6 lg:p-12">
                <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Privacy
                    Policy</h1>

                <div className="space-y-8 text-zinc-300 leading-relaxed">
                    <section>
                        <p className="text-lg">
                            At LensCorrect, we believe your photos belong to you. Our architecture is designed with
                            privacy as the core principle.
                        </p>
                    </section>

                    <section className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-800">
                        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            We do NOT collect your photos
                        </h2>
                        <p>
                            When you open an image in LensCorrect, it is loaded into your browser's local memory.
                            <strong>It is never uploaded to our servers.</strong>
                            No one else can see, access, or store your images.
                            Once you close the tab, the image data is wiped from your browser's memory.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">Data Collection</h2>
                        <p>
                            We do not track user behavior or use cookies for advertising.
                            The application is entirely client-side.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-white mb-4">Contact</h2>
                        <p>
                            If you have any questions about this project, please check the source code on GitHub.
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
