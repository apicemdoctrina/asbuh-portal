import StatusLight from "./StatusLight.jsx";
import ActivityFeed from "./ActivityFeed.jsx";
import SummaryBlocks from "./SummaryBlocks.jsx";

export default function ClientOrgDashboard({ org, showOrgName = false }) {
  return (
    <div className="flex flex-col gap-4">
      <StatusLight
        status={org.status}
        actions={org.actions}
        summary={org.summary}
        orgName={showOrgName ? org.name : null}
      />
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4">
        <ActivityFeed feed={org.feed} />
        <SummaryBlocks summary={org.summary} />
      </div>
    </div>
  );
}
