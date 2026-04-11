import MatrixView from '../components/MatrixView';
export default function WorshipPage() {
  return <MatrixView initialShowTeams={{ vocalists: true, rhythm: true, tech: false, orchestra: false }} />;
}