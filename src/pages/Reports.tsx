import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Calendar } from "lucide-react";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type MonthlyData = {
  month: string;
  income: number;
  expense: number;
  balance: number;
};

type DailyBalance = {
  date: string;
  account_name: string;
  balance: number;
};

type Budget = {
  id: string;
  category_id: string;
  category_name: string;
  amount: number;
  spent: number;
  month: string;
};

type Category = {
  id: string;
  name: string;
};

type Account = {
  id: string;
  name: string;
};

const Reports = () => {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [dailyBalances, setDailyBalances] = useState<DailyBalance[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    category_id: "",
    amount: "",
    month: new Date().toISOString().slice(0, 7),
  });

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchData();
  }, [selectedMonth, selectedAccount, selectedCategory, selectedTags, startDate, endDate]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Fetch accounts
      const { data: accountsData } = await supabase
        .from("accounts")
        .select("id, name, balance")
        .eq("user_id", user.id);

      setAccounts(accountsData || []);

      // Fetch transactions with optional filters
      let transQuery = supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id);
      
      if (selectedAccount !== "all") {
        transQuery = transQuery.eq("account_id", selectedAccount);
      }
      
      if (selectedCategory !== "all") {
        transQuery = transQuery.eq("category_id", selectedCategory);
      }

      if (startDate) {
        transQuery = transQuery.gte("date", startDate);
      }

      if (endDate) {
        transQuery = transQuery.lte("date", endDate);
      }

      const { data: transactions, error: transError } = await transQuery;

      if (transError) throw transError;

      // Fetch tags and transaction_tags
      const { data: tagsData } = await supabase
        .from("tags")
        .select("id, name, color")
        .eq("user_id", user.id);

      setTags(tagsData || []);

      const { data: transactionTagsData } = await supabase
        .from("transaction_tags")
        .select("transaction_id, tag_id");

      // Filtrar transações por tags se houver seleção
      let filteredTransactions = transactions || [];
      if (selectedTags.length > 0) {
        const transactionIdsWithSelectedTags = new Set(
          (transactionTagsData || [])
            .filter(tt => selectedTags.includes(tt.tag_id))
            .map(tt => tt.transaction_id)
        );
        filteredTransactions = filteredTransactions.filter(t =>
          transactionIdsWithSelectedTags.has(t.id)
        );
      }

      // Calculate monthly data
      const monthlyMap = new Map<string, { income: number; expense: number }>();
      
      filteredTransactions.forEach((t) => {
        const month = t.date.slice(0, 7);
        if (!monthlyMap.has(month)) {
          monthlyMap.set(month, { income: 0, expense: 0 });
        }
        const data = monthlyMap.get(month)!;
        if (t.type === "receita") {
          data.income += Number(t.amount);
        } else {
          data.expense += Number(t.amount);
        }
      });

      const monthly = Array.from(monthlyMap.entries())
        .map(([month, data]) => ({
          month,
          income: data.income,
          expense: data.expense,
          balance: data.income - data.expense,
        }))
        .sort((a, b) => b.month.localeCompare(a.month));

      setMonthlyData(monthly);

      // Calculate daily balances per account (with initial balance)
      // Sort transactions chronologically
      const sortedTransactions = filteredTransactions.sort((a, b) => a.date.localeCompare(b.date));

      // Calculate running balance for each account on each day
      const accountBalances = new Map<string, number>();
      const dailyBalancesList: DailyBalance[] = [];

      // Initialize balances with account initial balance
      accountsData?.forEach(acc => {
        accountBalances.set(acc.id, Number(acc.balance));
      });

      // Process transactions chronologically (they modify the running balance)
      sortedTransactions.forEach((t) => {
        const currentBalance = accountBalances.get(t.account_id) || 0;
        const change = t.type === "receita" ? Number(t.amount) : -Number(t.amount);
        const newBalance = currentBalance + change;
        accountBalances.set(t.account_id, newBalance);

        // Store end-of-day balance for this account on this date
        const account = accountsData?.find(a => a.id === t.account_id);
        if (account) {
          dailyBalancesList.push({
            date: t.date,
            account_name: account.name,
            balance: newBalance,
          });
        }
      });

      // Sort by date descending (most recent first)
      dailyBalancesList.sort((a, b) => b.date.localeCompare(a.date));

      setDailyBalances(dailyBalancesList);

      // Fetch budgets for the selected month
      const monthStart = selectedMonth + "-01";
      const { data: budgetsData } = await supabase
        .from("budgets")
        .select("*")
        .eq("user_id", user.id)
        .eq("month", monthStart);

      const { data: categoriesData } = await supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", user.id);

      setCategories(categoriesData || []);

      // Calculate spending per category for the selected month
      const categorySpending = new Map<string, number>();
      filteredTransactions
        .filter(t => t.date.startsWith(selectedMonth) && t.type === "despesa")
        .forEach(t => {
          if (t.category_id) {
            const current = categorySpending.get(t.category_id) || 0;
            categorySpending.set(t.category_id, current + Number(t.amount));
          }
        });

      const budgetsWithSpent = budgetsData?.map(b => {
        const category = categoriesData?.find(c => c.id === b.category_id);
        return {
          id: b.id,
          category_id: b.category_id,
          category_name: category?.name || "N/A",
          amount: Number(b.amount),
          spent: categorySpending.get(b.category_id) || 0,
          month: b.month,
        };
      }) || [];

      setBudgets(budgetsWithSpent);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getNextMonth = (month: string) => {
    const date = new Date(month + "-01");
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().slice(0, 7);
  };

  const handleSubmitBudget = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("budgets").insert([
        {
          user_id: user.id,
          category_id: formData.category_id,
          amount: Number(formData.amount),
          month: formData.month + "-01",
        },
      ]);

      if (error) throw error;

      toast({
        title: "Orçamento criado",
        description: "O orçamento foi criado com sucesso.",
      });

      setOpen(false);
      setFormData({
        category_id: "",
        amount: "",
        month: new Date().toISOString().slice(0, 7),
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao criar orçamento",
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
          <h2 className="text-3xl font-bold tracking-tight">Relatórios</h2>
          <p className="text-muted-foreground mt-1">
            Visualize saldos mensais, acumulados e conciliação bancária
          </p>
        </div>

        {/* Filtros Globais */}
        <Card className="bg-gradient-card">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <Label htmlFor="start-date">Data Início</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="end-date">Data Fim</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="account-filter">Conta</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category-filter">Categoria</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="tags-filter">Tags</Label>
                <Select
                  value={selectedTags.length > 0 ? selectedTags[0] : "all"}
                  onValueChange={(value) => {
                    if (value === "all") {
                      setSelectedTags([]);
                    } else {
                      setSelectedTags(prev =>
                        prev.includes(value)
                          ? prev.filter(id => id !== value)
                          : [...prev, value]
                      );
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {selectedTags.length === 0 ? (
                        "Todas as tags"
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {selectedTags.map(tagId => {
                            const tag = tags.find(t => t.id === tagId);
                            return tag ? (
                              <Badge
                                key={tag.id}
                                style={{
                                  backgroundColor: tag.color,
                                  color: '#fff'
                                }}
                                className="text-xs"
                              >
                                {tag.name}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as tags</SelectItem>
                    {tags.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <div className="flex items-center gap-2">
                          {selectedTags.includes(tag.id) && <span>✓</span>}
                          <Badge
                            style={{
                              backgroundColor: tag.color,
                              color: '#fff'
                            }}
                            className="text-xs"
                          >
                            {tag.name}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setSelectedAccount("all");
                    setSelectedCategory("all");
                    setSelectedTags([]);
                  }}
                  title="Limpar Filtros"
                >
                  🗑️
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="monthly" className="space-y-4">
          <TabsList>
            <TabsTrigger value="monthly">Saldo Mensal</TabsTrigger>
            <TabsTrigger value="daily">Conciliação Bancária</TabsTrigger>
            <TabsTrigger value="budgets">Orçamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly" className="space-y-4">
            {monthlyData.length === 0 ? (
              <Card className="bg-gradient-card">
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    Nenhum dado mensal disponível.
                  </p>
                </CardContent>
              </Card>
            ) : (
              monthlyData.map((data) => (
                <Card key={data.month} className="bg-gradient-card hover:shadow-lg transition-all">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{new Date(data.month + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
                      <span className={`text-2xl font-bold ${data.balance >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(data.balance)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-success" />
                        <div>
                          <p className="text-sm text-muted-foreground">Receitas</p>
                          <p className="text-lg font-bold text-success">{formatCurrency(data.income)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-5 w-5 text-destructive" />
                        <div>
                          <p className="text-sm text-muted-foreground">Despesas</p>
                          <p className="text-lg font-bold text-destructive">{formatCurrency(data.expense)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="daily" className="space-y-4">
            <div className="space-y-4">
              {dailyBalances.length === 0 ? (
                <Card className="bg-gradient-card">
                  <CardContent className="py-12 text-center">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Nenhuma transação registrada.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-gradient-card">
                  <CardHeader>
                    <CardTitle>Saldo Diário por Conta</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dailyBalances.slice(0, 20).map((item, index) => (
                        <div key={index} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                          <div>
                            <p className="font-medium">{item.account_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(item.date).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                          <p className={`text-lg font-bold ${item.balance >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(item.balance)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="budgets" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <Label htmlFor="month">Mês do Orçamento</Label>
                <Input
                  id="month"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-48"
                />
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Target className="h-4 w-4" />
                    Novo Orçamento
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo Orçamento</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmitBudget} className="space-y-4">
                    <div>
                      <Label htmlFor="category">Categoria</Label>
                      <Select
                        value={formData.category_id}
                        onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="amount">Valor do Orçamento</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="budget-month">Mês</Label>
                      <Input
                        id="budget-month"
                        type="month"
                        value={formData.month}
                        onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                        required
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1">
                        Criar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-4">
              {budgets.length === 0 ? (
                <Card className="bg-gradient-card">
                  <CardContent className="py-12 text-center">
                    <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Nenhum orçamento definido para este mês.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                budgets.map((budget) => {
                  const percentage = (budget.spent / budget.amount) * 100;
                  const isOverBudget = percentage > 100;
                  
                  return (
                    <Card key={budget.id} className="bg-gradient-card hover:shadow-lg transition-all">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{budget.category_name}</span>
                          <Target className="h-5 w-5 text-primary" />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Gasto</p>
                            <p className={`text-2xl font-bold ${isOverBudget ? "text-destructive" : "text-foreground"}`}>
                              {formatCurrency(budget.spent)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Orçamento</p>
                            <p className="text-2xl font-bold">{formatCurrency(budget.amount)}</p>
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-muted-foreground">Progresso</span>
                            <span className={`font-medium ${isOverBudget ? "text-destructive" : "text-foreground"}`}>
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${isOverBudget ? "bg-destructive" : "bg-primary"}`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                          </div>
                        </div>

                        {isOverBudget && (
                          <p className="text-sm text-destructive font-medium">
                            Você excedeu o orçamento em {formatCurrency(budget.spent - budget.amount)}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Reports;
