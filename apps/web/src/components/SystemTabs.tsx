import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemPage } from "@/components/SystemPage";
import { ContainersTable } from "@/components/ContainersTable";
import { ProcessesTable } from "@/components/ProcessesTable";

type Tab = "overview" | "containers" | "processes";

export function SystemTabs() {
  const [tab, setTab] = React.useState<Tab>("overview");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <TabsList className="mb-6">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="containers">Containers</TabsTrigger>
        <TabsTrigger value="processes">Processes</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <SystemPage />
      </TabsContent>
      <TabsContent value="containers">
        <ContainersTable />
      </TabsContent>
      <TabsContent value="processes">
        <ProcessesTable />
      </TabsContent>
    </Tabs>
  );
}
