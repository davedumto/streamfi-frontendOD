import StreamTestComponent from "@/components/StreamTestComponent";
import Navbar from "@/components/explore/Navbar";

export default function TestStreamPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <Navbar />
      <StreamTestComponent />
    </div>
  );
}
