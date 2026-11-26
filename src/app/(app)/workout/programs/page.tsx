import { ChevronRight, Copy } from "lucide-react";
import { Badge, Card, CardLink, Input, PageHeader, SectionTitle } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { listPrograms, listProgramTemplates } from "@/lib/workout/service";
import { cloneTemplateAction, createProgramAction } from "../actions";
import { ActionForm } from "../_components/action-form";

export default async function ProgramsPage() {
  const user = await requireUser();
  const programs = await listPrograms(user.id);
  const templates = listProgramTemplates();
  return (
    <>
      <PageHeader title="Programy" subtitle="Aktivní program určuje dnešní trénink." back="/workout" />

      {programs.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {programs.map((p) => (
            <CardLink key={p.id} href={`/workout/programs/${p.id}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    {p.isActive && <Badge tone="solid">Aktivní</Badge>}
                  </div>
                  <div className="num mt-0.5 text-xs text-muted">
                    {p.dayCount} dní · {p.exerciseCount} cviků
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-subtle" />
              </div>
            </CardLink>
          ))}
        </div>
      )}

      <SectionTitle>Nový program</SectionTitle>
      <Card>
        <ActionForm action={createProgramAction} className="flex gap-2">
          <Input name="name" placeholder="Název programu" required maxLength={80} className="flex-1" />
          <SubmitButton>Vytvořit</SubmitButton>
        </ActionForm>
      </Card>

      <SectionTitle>Šablony</SectionTitle>
      <div className="grid gap-3 md:grid-cols-3">
        {templates.map((tpl) => (
          <Card key={tpl.key} className="flex flex-col">
            <div className="font-medium">{tpl.name}</div>
            <p className="mt-1 flex-1 text-sm text-muted">{tpl.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tpl.days.map((d) => (
                <Badge key={d.name}>{d.name}</Badge>
              ))}
            </div>
            <ActionForm action={cloneTemplateAction} wrapClassName="mt-4">
              <input type="hidden" name="key" value={tpl.key} />
              <SubmitButton variant="secondary" className="w-full" pendingText="Kopíruji…">
                <Copy className="h-4 w-4" /> Použít šablonu
              </SubmitButton>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
