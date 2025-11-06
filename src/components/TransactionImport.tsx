import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

type Account = {
  id: string;
  name: string;
};

type Category = {
  id: string;
  name: string;
};

type TransactionImportProps = {
  accounts: Account[];
  categories: Category[];
  onImportComplete: () => void;
};

const TransactionImport = ({ accounts, categories, onImportComplete }: TransactionImportProps) => {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const downloadTemplate = () => {
    const template = [
      {
        Descrição: "Exemplo - Supermercado",
        Valor: 150.50,
        Tipo: "despesa",
        Data: "2024-01-15",
        Conta: accounts[0]?.name || "Nome da Conta",
        Categoria: categories[0]?.name || "Nome da Categoria",
        Observações: "Observações opcionais"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transações");

    // Ajustar largura das colunas
    ws['!cols'] = [
      { wch: 30 }, // Descrição
      { wch: 12 }, // Valor
      { wch: 15 }, // Tipo
      { wch: 12 }, // Data
      { wch: 20 }, // Conta
      { wch: 20 }, // Categoria
      { wch: 40 }  // Observações
    ];

    XLSX.writeFile(wb, "modelo_transacoes.xlsx");
    
    toast({
      title: "Modelo baixado",
      description: "O arquivo modelo foi baixado com sucesso.",
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        throw new Error("O arquivo está vazio");
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const row of jsonData) {
        try {
          // Validar campos obrigatórios
          if (!row.Descrição || !row.Valor || !row.Tipo || !row.Data || !row.Conta) {
            errors.push(`Linha com descrição "${row.Descrição || 'vazia'}": campos obrigatórios faltando`);
            errorCount++;
            continue;
          }

          // Validar tipo
          const tipo = row.Tipo.toLowerCase();
          if (!["receita", "despesa", "transferencia"].includes(tipo)) {
            errors.push(`"${row.Descrição}": tipo inválido (use: receita, despesa ou transferencia)`);
            errorCount++;
            continue;
          }

          // Buscar conta
          const account = accounts.find(a => 
            a.name.toLowerCase() === row.Conta.toLowerCase()
          );
          if (!account) {
            errors.push(`"${row.Descrição}": conta "${row.Conta}" não encontrada`);
            errorCount++;
            continue;
          }

          // Buscar categoria (não obrigatório para transferências)
          let categoryId = null;
          if (tipo !== "transferencia" && row.Categoria) {
            const category = categories.find(c => 
              c.name.toLowerCase() === row.Categoria.toLowerCase()
            );
            if (!category) {
              errors.push(`"${row.Descrição}": categoria "${row.Categoria}" não encontrada`);
              errorCount++;
              continue;
            }
            categoryId = category.id;
          }

          // Validar e formatar data
          let formattedDate: string;
          if (typeof row.Data === 'number') {
            // Data no formato serial do Excel
            const date = XLSX.SSF.parse_date_code(row.Data);
            formattedDate = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
          } else {
            // Data em formato texto
            const dateStr = String(row.Data);
            const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{4})/);
            if (!dateMatch) {
              errors.push(`"${row.Descrição}": formato de data inválido (use AAAA-MM-DD ou DD/MM/AAAA)`);
              errorCount++;
              continue;
            }
            if (dateMatch[1]) {
              formattedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
            } else {
              formattedDate = `${dateMatch[6]}-${dateMatch[5]}-${dateMatch[4]}`;
            }
          }

          // Criar transação
          const transactionData = {
            description: String(row.Descrição),
            amount: Number(row.Valor),
            type: tipo,
            date: formattedDate,
            account_id: account.id,
            category_id: categoryId,
            subcategory_id: null,
            observations: row.Observações ? String(row.Observações) : null,
            destination_account_id: null,
            user_id: user.id,
          };

          const { error } = await supabase
            .from("transactions")
            .insert([transactionData]);

          if (error) throw error;
          successCount++;
        } catch (error: any) {
          errors.push(`"${row.Descrição}": ${error.message}`);
          errorCount++;
        }
      }

      // Mostrar resultado
      if (successCount > 0) {
        toast({
          title: "Importação concluída",
          description: `${successCount} transação(ões) importada(s) com sucesso${errorCount > 0 ? `. ${errorCount} erro(s) encontrado(s).` : '.'}`,
        });
      }

      if (errors.length > 0 && errors.length <= 5) {
        // Mostrar erros se forem poucos
        toast({
          title: "Erros na importação",
          description: errors.join("\n"),
          variant: "destructive",
        });
      } else if (errors.length > 5) {
        toast({
          title: "Erros na importação",
          description: `${errorCount} erro(s) encontrado(s). Verifique o arquivo e tente novamente.`,
          variant: "destructive",
        });
      }

      if (successCount > 0) {
        setOpen(false);
        onImportComplete();
      }
    } catch (error: any) {
      toast({
        title: "Erro ao importar arquivo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      // Limpar input
      event.target.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Transações do Excel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Faça o upload de um arquivo Excel (.xlsx) com suas transações. 
            O arquivo deve conter as colunas: Descrição, Valor, Tipo, Data, Conta, Categoria (opcional para transferências) e Observações (opcional).
          </p>
          
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={downloadTemplate}
            >
              <Download className="h-4 w-4" />
              Baixar Modelo Excel
            </Button>

            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={importing}
                className="hidden"
                id="excel-upload"
              />
              <label htmlFor="excel-upload">
                <Button
                  variant="default"
                  className="w-full gap-2"
                  disabled={importing}
                  asChild
                >
                  <span>
                    <Upload className="h-4 w-4" />
                    {importing ? "Importando..." : "Selecionar Arquivo Excel"}
                  </span>
                </Button>
              </label>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Tipos válidos:</strong> receita, despesa, transferencia</p>
            <p><strong>Formato de data:</strong> AAAA-MM-DD ou DD/MM/AAAA</p>
            <p><strong>Nota:</strong> Os nomes das contas e categorias devem corresponder exatamente aos cadastrados no sistema.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransactionImport;
