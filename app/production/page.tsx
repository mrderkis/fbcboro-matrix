import MatrixView from '../components/MatrixView';
import { getDisplaySettings } from '../actions/settings';

export default async function ProductionPage() {
  const config = await getDisplaySettings();
  
  // Directly pull the PRODUCTION object from the JSON
  const activeSettings = config['PRODUCTION'];

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