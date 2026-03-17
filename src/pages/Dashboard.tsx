import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, TrendingDown, DollarSign, Clock, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  institution: string | null;
};

type PendingTransaction = {
  id: string;
  description: string;
  amount: number;
  type: string;
  date: string;
  account_id: string;
  category_id: string | null;
};

const Dashboard = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [accountNames, setAccountNames] = useState<Map<string, string>>(new Map());
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

      const { data: transactionsData, error: transError } = await supabase
        .from("transactions")
        .select("id, account_id, amount, type, date, destination_account_id, transfer_pair_id, created_at, status")
        .lte("date", new Date().toISOString().split('T')[0]);

      if (transError) throw transError;

      // Pending transactions (all dates, not just past)
      const { data: pendingData, error: pendingError } = await supabase
        .from("transactions")
        .select("id, description, amount, type, date, account_id, category_id, transfer_pair_id, created_at")
        .eq("status", "pendente")
        .neq("type", "transferencia")
        .order("date", { ascending: true })
        .limit(10);

      if (pendingError) throw pendingError;

      // Build account name map
      const nameMap = new Map<string, string>();
      (accountsData || []).forEach(acc => nameMap.set(acc.id, acc.name));
      setAccountNames(nameMap);
      setPendingTransactions(pendingData || []);

      // Calculate current balance for each account
      const accountBalances = new Map<string, number>();
      (accountsData || []).forEach(acc => {
        accountBalances.set(acc.id, Number(acc.balance));
      });

      const processedTransfers = new Set<string>();
      const transactionMap = new Map<string, typeof transactionsData[0]>();
      (transactionsData || []).forEach(t => {
        transactionMap.set(t.id, t);
      });

      (transactionsData || []).forEach(t => {
        // Only count realized transactions for balance
        if ((t as any).status === 'pendente') return;

        if (t.type === "transferencia") {
          if (processedTransfers.has(t.id)) return;
          
          if (t.transfer_pair_id) {
            const pairTransaction = transactionMap.get(t.transfer_pair_id);
            if (pairTransaction) {
              const thisCreatedAt = new Date(t.created_at).getTime();
              const pairCreatedAt = new Date(pairTransaction.created_at).getTime();
              if (thisCreatedAt > pairCreatedAt) {
                processedTransfers.add(t.id);
                return;
              }
            }
          }
          
          const originBalance = accountBalances.get(t.account_id) || 0;
          accountBalances.set(t.account_id, originBalance - Number(t.amount));
          
          if (t.destination_account_id) {
            const destBalance = accountBalances.get(t.destination_account_id) || 0;
            accountBalances.set(t.destination_account_id, destBalance + Number(t.amount));
          }

          processedTransfers.add(t.id);
          if (t.transfer_pair_id) {
            processedTransfers.add(t.transfer_pair_id);
          }
        } else {
          const currentBalance = accountBalances.get(t.account_id) || 0;
          const change = t.type === "receita" ? Number(t.amount) : -Number(t.amount);
          accountBalances.set(t.account_id, currentBalance + change);
        }
      });

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
      cartao: "Conta Cartão",
    };
    return types[type] || type;
  };

  const accountTypes = ["corrente", "beneficio", "investimento", "cartao"] as const;
  
  const groupedAccounts = accountTypes.map(type => {
    const accountsOfType = accounts.filter(acc => acc.type === type);
    const subtotal = accountsOfType.reduce((sum, acc) => sum + Number(acc.balance), 0);
    return {
      type,
      label: getAccountTypeLabel(type),
      accounts: accountsOfType,
      subtotal,
    };
  }).filter(group => group.accounts.length > 0);

  const today = new Date().toISOString().split('T')[0];
  const overduePending = pendingTransactions.filter(t => t.date < today);
  const upcomingPending = pendingTransactions.filter(t => t.date >= today);

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
                Todas as contas (realizado)
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

        {/* Próximos Pagamentos Pendentes */}
        {pendingTransactions.length > 0 && (
          <div>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              Pagamentos Pendentes
            </h3>

            {overduePending.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-destructive font-semibold uppercase tracking-wide mb-2">Vencidos</p>
                <div className="space-y-1">
                  {overduePending.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20"
                    >
                      {t.type === "receita" ? (
                        <ArrowUpCircle className="h-4 w-4 text-success flex-shrink-0" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
                        {t.date.split('-').reverse().join('/')}
                      </span>
                      <span className="flex-1 text-sm font-medium truncate">{t.description}</span>
                      <span className="text-xs text-muted-foreground hidden sm:block flex-shrink-0">
                        {accountNames.get(t.account_id) || ""}
                      </span>
                      <Badge variant="outline" className="border-destructive text-destructive text-xs flex-shrink-0">
                        Vencido
                      </Badge>
                      <span className={`text-sm font-semibold flex-shrink-0 ${t.type === "receita" ? "text-success" : "text-destructive"}`}>
                        {t.type === "receita" ? "+" : "-"}{formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {upcomingPending.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">Próximos</p>
                <div className="space-y-1">
                  {upcomingPending.map(t => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-dashed border-border/60"
                    >
                      {t.type === "receita" ? (
                        <ArrowUpCircle className="h-4 w-4 text-success flex-shrink-0" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
                        {t.date.split('-').reverse().join('/')}
                      </span>
                      <span className="flex-1 text-sm font-medium truncate">{t.description}</span>
                      <span className="text-xs text-muted-foreground hidden sm:block flex-shrink-0">
                        {accountNames.get(t.account_id) || ""}
                      </span>
                      <span className={`text-sm font-semibold flex-shrink-0 ${t.type === "receita" ? "text-success" : "text-destructive"}`}>
                        {t.type === "receita" ? "+" : "-"}{formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
            <div className="space-y-6">
              {groupedAccounts.map((group) => (
                <div key={group.type}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-medium text-muted-foreground">{group.label}</h4>
                    <span className={`text-lg font-bold ${group.subtotal >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(group.subtotal)}
                    </span>
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {group.accounts.map((account) => (
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
