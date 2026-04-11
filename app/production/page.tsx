import MatrixView from '../components/MatrixView';
export default function ProductionPage() {
  return <MatrixView initialShowTeams={{ vocalists: false, rhythm: false, tech: true, orchestra: false }} />;
}