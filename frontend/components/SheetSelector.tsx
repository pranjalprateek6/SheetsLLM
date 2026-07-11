"use client";
import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SheetSelectorProps {
  isOpen: boolean;
  sheets: string[];
  onSelect: (sheetName: string) => void;
  onCancel: () => void;
}

export default function SheetSelector({
  isOpen,
  sheets,
  onSelect,
  onCancel
}: SheetSelectorProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose a sheet</DialogTitle>
          <DialogDescription>
            This workbook contains multiple sheets. Choose one to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {sheets.map((sheet, i) => (
            <Button
              key={i}
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSelect(sheet)}
            >
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              {sheet}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
