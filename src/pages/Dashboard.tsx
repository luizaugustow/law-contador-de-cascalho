import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  institution: string | null;
};

const Dashboard = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);
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
        .select("account_id, amount, type, date, destination_account_id")
        .lte("date", new Date().toISOString().split('T')[0]);

      if (transError) throw transError;

      // Calculate current balance for each account
      const accountBalances = new Map<string, number>();
      (accountsData || []).forEach(acc => {
        accountBalances.set(acc.id, Number(acc.balance));
      });

      // Apply transactions to calculate current balance
      (transactionsData || []).forEach(t => {
        if (t.type === "transferencia") {
          // Transferências: debita origem e credita destino
          const originBalance = accountBalances.get(t.account_id) || 0;
          accountBalances.set(t.account_id, originBalance - Number(t.amount));
          
          if (t.destination_account_id) {
            const destBalance = accountBalances.get(t.destination_account_id) || 0;
            accountBalances.set(t.destination_account_id, destBalance + Number(t.amount));
          }
        } else {
          const currentBalance = accountBalances.get(t.account_id) || 0;
          const change = t.type === "receita" ? Number(t.amount) : -Number(t.amount);
          accountBalances.set(t.account_id, currentBalance + change);
        }
      });

      // Update accounts with current balances
      const accountsWithCurrentBalance = (accountsData || []).map(acc => ({
        ...acc,
        balance: accountBalances.get(acc.id) || Number(acc.balance)
      }));

      setAccounts(accountsWithCurrentBalance);
      const total = accountsWithCurrentBalance.reduce((sum, acc) => sum + Number(acc.balance), 0);
      setTotalBalance(total);
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
      <div className="space-y-8 animate-fade-in">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Visão geral do seu controle financeiro
          </p>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-card shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Todas as contas
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Contas</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{accounts.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Contas ativas
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Receitas</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">R$ 0,00</div>
              <p className="text-xs text-muted-foreground mt-1">
                Este mês
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Despesas</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">R$ 0,00</div>
              <p className="text-xs text-muted-foreground mt-1">
                Este mês
              </p>
            </CardContent>
          </Card>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-4">Suas Contas</h3>
          {accounts.length === 0 ? (
            <Card className="bg-gradient-card">
              <CardContent className="py-12 text-center">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nenhuma conta cadastrada ainda.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Vá para a seção de Contas para adicionar sua primeira conta.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((account) => (
                <Card key={account.id} className="bg-gradient-card shadow-md hover:shadow-lg transition-all hover-scale">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-lg">{account.name}</span>
                      <Wallet className="h-5 w-5 text-primary" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm text-muted-foreground">Tipo</p>
                        <p className="font-medium">{getAccountTypeLabel(account.type)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Saldo</p>
                        <p className={`text-xl font-bold ${Number(account.balance) >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(Number(account.balance))}
                        </p>
                      </div>
                      {account.institution && (
                        <div>
                          <p className="text-sm text-muted-foreground">Instituição</p>
                          <p className="font-medium">{account.institution}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
