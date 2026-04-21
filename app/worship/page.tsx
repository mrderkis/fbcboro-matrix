import MatrixView from '../components/MatrixView';
import { getDisplaySettings } from '../actions/settings';

export default async function WorshipPage() {
  const config = await getDisplaySettings();
  
  // Directly pull the WORSHIP object from the JSON
  const activeSettings = config['WORSHIP'];

  if (!activeSettings) {
    return <MatrixView hideControls={true} />;
  }

  return (
    <MatrixView 
      initialShowTeams={activeSettings.teams}
      initialServiceCount={activeSettings.serviceCount}
      showSpecials={activeSettings.showSpecials}
      hideControls={true} 
    />
  );
}