import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemPage } from "@/components/SystemPage";
import { ProcessesTable } from "@/components/ProcessesTable";

export function SystemTabs() {
  const [tab, setTab] = React.useState<"overview" | "processes">("overview");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "overview" | "processes")}>
      <TabsList className="mb-6">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="processes">Processes</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <SystemPage />
      </TabsContent>
      <TabsContent value="processes">
        <p className="mb-3 text-xs text-muted-foreground">Every process on the host. Click a column to sort.</p>
        <ProcessesTable />
      </TabsContent>
    </Tabs>
  );
}
