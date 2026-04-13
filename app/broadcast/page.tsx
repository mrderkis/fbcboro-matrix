import MatrixView from '../components/MatrixView';

export default function BroadcastPage() {
  return (
    <main className="h-screen w-screen bg-[#090C0F]">
      <MatrixView 
        initialServiceCount={2} 
        showSpecials={false} 
        hideControls={true}
        isBroadcast={true} 
        initialShowTeams={{ 
          vocalists: true, 
          rhythm: true, 
          tech: true, 
          safety: true, 
          orchestra: false 
        }}
      />
    </main>
  );
}