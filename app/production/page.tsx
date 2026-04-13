import MatrixView from '../components/MatrixView';

export default function ProductionPage() {
  const productionDefaults = {
    vocalists: true,
    rhythm: true,
    tech: true,
    orchestra: false
  };
  return <MatrixView initialShowTeams={productionDefaults} hideControls={false} />;
}