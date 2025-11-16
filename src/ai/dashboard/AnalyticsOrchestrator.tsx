import { PropsWithChildren } from "react";
import { useAnalyticsBridge } from "../../hooks/useAnalyticsBridge";

export default function AnalyticsOrchestrator({
  children,
}: PropsWithChildren<{}>) {
  useAnalyticsBridge();
  return <>{children}</>;
}

