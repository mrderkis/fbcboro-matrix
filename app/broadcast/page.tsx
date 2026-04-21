import MatrixView from '../components/MatrixView';
import { getDisplaySettings } from '../actions/settings';

export default async function BroadcastPage() {
  const config = await getDisplaySettings();
  
  // Directly pull the BROADCAST object from the JSON
  const activeSettings = config['BROADCAST'];

  if (!activeSettings) {
    return <MatrixView hideControls={true} isBroadcast={true} />;
  }

  return (
    <MatrixView 
      initialShowTeams={activeSettings.teams}
      initialServiceCount={activeSettings.serviceCount}
      showSpecials={activeSettings.showSpecials}
      hideControls={true} 
      isBroadcast={true}
    />
  );
}