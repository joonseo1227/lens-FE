import Header from "@/app/components/Header";
import PanoramaEditor from "@/app/components/PanoramaEditor";

export default function PanoramaPage() {
    return (
        <div className="flex h-screen flex-col bg-black text-white font-sans selection:bg-blue-500/30 overflow-hidden">
            <Header/>

            <main className="flex-1 flex flex-col relative overflow-hidden">
                <PanoramaEditor/>
            </main>
        </div>
    );
}
