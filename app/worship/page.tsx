import MatrixView from '../components/MatrixView';

export default function WorshipPage() {
  const worshipDefaults = {
    vocalists: true,
    rhythm: true,
    tech: false,
    orchestra: false
  };

  return (
    <main className="bg-gray-100">
      <MatrixView initialShowTeams={worshipDefaults} hideControls={true} />
    </main>
  );
}