import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit, Wallet, Building2, TrendingUp, CreditCard } from "lucide-react";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const accountSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  type: z.enum(["corrente", "beneficio", "investimento"], { required_error: "Tipo é obrigatório" }),
  balance: z.number({ required_error: "Saldo é obrigatório" }),
  institution: z.string().max(100, "Nome da instituição muito longo").optional(),
});

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  institution: string | null;
};

const Accounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "corrente" as "corrente" | "beneficio" | "investimento",
    balance: "0",
    institution: "",
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchAccounts();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchAccounts = async () => {
    try {
      const { data: accountsData, error: accountsError } = await supabase
        .from("accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (accountsError) throw accountsError;

      // Fetch all transactions to calculate current balance
      const { data: transactionsData, error: transError } = await supabase
        .from("transactions")
        .select("account_id, amount, type, date")
        .lte("date", new Date().toISOString().split('T')[0]);

      if (transError) throw transError;

      // Calculate current balance for each account
      const accountBalances = new Map<string, number>();
      (accountsData || []).forEach(acc => {
        accountBalances.set(acc.id, Number(acc.balance));
      });

      // Apply transactions to calculate current balance
      (transactionsData || []).forEach(t => {
        const currentBalance = accountBalances.get(t.account_id) || 0;
        const change = t.type === "receita" ? Number(t.amount) : -Number(t.amount);
        accountBalances.set(t.account_id, currentBalance + change);
      });

      // Update accounts with current balances
      const accountsWithCurrentBalance = (accountsData || []).map(acc => ({
        ...acc,
        balance: accountBalances.get(acc.id) || Number(acc.balance)
      }));

      setAccounts(accountsWithCurrentBalance);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar contas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const parsedData = {
        ...formData,
        balance: parseFloat(formData.balance),
      };

      accountSchema.parse(parsedData);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (editingAccount) {
        const { error } = await supabase
          .from("accounts")
          .update(parsedData)
          .eq("id", editingAccount.id);

        if (error) throw error;
        toast({ title: "Conta atualizada com sucesso!" });
      } else {
        const { error } = await supabase
          .from("accounts")
          .insert([{ ...parsedData, user_id: user.id }]);

        if (error) throw error;
        toast({ title: "Conta criada com sucesso!" });
      }

      setDialogOpen(false);
      setEditingAccount(null);
      setFormData({ name: "", type: "corrente", balance: "0", institution: "" });
      fetchAccounts();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Erro de validação",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro ao salvar conta",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta conta?")) return;

    try {
      const { error } = await supabase
        .from("accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Conta excluída com sucesso!" });
      fetchAccounts();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir conta",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getAccountTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      corrente: "Conta Corrente",
      beneficio: "Conta Benefício",
      investimento: "Conta Investimento",
    };
    return types[type] || type;
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case "corrente":
        return <CreditCard className="h-5 w-5" />;
      case "beneficio":
        return <Wallet className="h-5 w-5" />;
      case "investimento":
        return <TrendingUp className="h-5 w-5" />;
      default:
        return <Wallet className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Contas</h2>
            <p className="text-muted-foreground mt-1">
              Gerencie suas contas bancárias e investimentos
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingAccount(null)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingAccount ? "Editar Conta" : "Nova Conta"}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados da conta
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Conta Salário"
                      required
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <Label htmlFor="type">Tipo</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: "corrente" | "beneficio" | "investimento") =>
                        setFormData({ ...formData, type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="corrente">Conta Corrente</SelectItem>
                        <SelectItem value="beneficio">Conta Benefício</SelectItem>
                        <SelectItem value="investimento">Conta Investimento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="balance">Saldo Inicial</Label>
                    <Input
                      id="balance"
                      type="number"
                      step="0.01"
                      value={formData.balance}
                      onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="institution">Instituição (Opcional)</Label>
                    <Input
                      id="institution"
                      value={formData.institution}
                      onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                      placeholder="Ex: Banco do Brasil"
                      maxLength={100}
                    />
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button type="submit">Salvar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {accounts.length === 0 ? (
          <Card className="bg-gradient-card">
            <CardContent className="py-12 text-center">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Nenhuma conta cadastrada ainda.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <Card key={account.id} className="bg-gradient-card shadow-md hover:shadow-lg transition-all hover-scale">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-primary">
                        {getAccountIcon(account.type)}
                      </div>
                      <div>
                        <p className="text-base font-semibold">{account.name}</p>
                        <p className="text-xs text-muted-foreground font-normal">
                          {getAccountTypeLabel(account.type)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingAccount(account);
                          setFormData({
                            name: account.name,
                            type: account.type as "corrente" | "beneficio" | "investimento",
                            balance: account.balance.toString(),
                            institution: account.institution || "",
                          });
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(account.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Saldo Atual</p>
                      <p className={`text-2xl font-bold ${Number(account.balance) >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatCurrency(Number(account.balance))}
                      </p>
                    </div>
                    {account.institution && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                        <Building2 className="h-4 w-4" />
                        <span>{account.institution}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Accounts;
