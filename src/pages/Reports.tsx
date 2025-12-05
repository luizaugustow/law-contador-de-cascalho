import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Calendar, Edit, Trash2 } from "lucide-react";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect, Option } from "@/components/ui/multi-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  balance: number;
  month: string;
};

type Category = {
  id: string;
  name: string;
  emoji?: string;
};

type Subcategory = {
  id: string;
  name: string;
  category_id: string;
};

type Account = {
  id: string;
  name: string;
  balance: number;
};

const Reports = () => {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [dailyBalances, setDailyBalances] = useState<DailyBalance[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
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
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchData();
  }, [selectedMonth, selectedAccounts, selectedCategories, selectedSubcategories, selectedTags, startDate, endDate]);

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
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      setAccounts(accountsData || []);

      // Fetch ALL transactions (without account filter) for accurate balance calculation
      const { data: allTransactions, error: allTransError } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id);

      if (allTransError) throw allTransError;

      // Fetch transactions with optional filters (for monthly data, dashboards, etc.)
      let transQuery = supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id);
      
      if (selectedAccounts.length > 0) {
        transQuery = transQuery.or(
          `account_id.in.(${selectedAccounts.join(',')}),destination_account_id.in.(${selectedAccounts.join(',')})`
        );
      }
      
      if (selectedCategories.length > 0) {
        transQuery = transQuery.in("category_id", selectedCategories);
      }

      if (selectedSubcategories.length > 0) {
        transQuery = transQuery.in("subcategory_id", selectedSubcategories);
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
        // Transferências não contam como receita ou despesa nos relatórios
        if (t.type === "transferencia") return;
        
        const month = t.date.slice(0, 7);
        if (!monthlyMap.has(month)) {
          monthlyMap.set(month, { income: 0, expense: 0 });
        }
        const data = monthlyMap.get(month)!;
        if (t.type === "receita") {
          data.income += Number(t.amount);
        } else if (t.type === "despesa") {
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

      // === CONCILIAÇÃO BANCÁRIA ===
      // Usa TODAS as transações para calcular saldos corretos, filtro apenas limita exibição
      const sortedAllTransactions = [...(allTransactions || [])].sort((a, b) => a.date.localeCompare(b.date));

      // Mapa de saldo acumulado por conta
      const accountBalances = new Map<string, number>();
      // Mapa de saldo diário final por conta: Map<"date|accountId", balance>
      const dailyAccountBalances = new Map<string, { date: string; accountId: string; accountName: string; balance: number }>();

      // Initialize balances with account initial balance
      accountsData?.forEach(acc => {
        accountBalances.set(acc.id, Number(acc.balance));
      });

      // Track processed transfers to avoid double-counting
      const processedTransfers = new Set<string>();

      // Criar um mapa de transações para encontrar pares
      const transactionMap = new Map<string, typeof sortedAllTransactions[0]>();
      sortedAllTransactions.forEach(t => {
        transactionMap.set(t.id, t);
      });

      // Process ALL transactions chronologically to calculate accurate balances
      sortedAllTransactions.forEach((t) => {
        if (t.type === "transferencia") {
          // Skip if we already processed this transfer pair
          if (processedTransfers.has(t.id)) return;

          // Para transferências com par, processar apenas a transação criada primeiro (débito original)
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

          // Transferências: debita origem e credita destino
          const originBalance = accountBalances.get(t.account_id) || 0;
          const newOriginBalance = originBalance - Number(t.amount);
          accountBalances.set(t.account_id, newOriginBalance);
          
          // Update daily balance for origin account
          const originAccount = accountsData?.find(a => a.id === t.account_id);
          if (originAccount) {
            const key = `${t.date}|${t.account_id}`;
            dailyAccountBalances.set(key, {
              date: t.date,
              accountId: t.account_id,
              accountName: originAccount.name,
              balance: newOriginBalance,
            });
          }
          
          if (t.destination_account_id) {
            const destBalance = accountBalances.get(t.destination_account_id) || 0;
            const newDestBalance = destBalance + Number(t.amount);
            accountBalances.set(t.destination_account_id, newDestBalance);
            
            // Update daily balance for destination account
            const destAccount = accountsData?.find(a => a.id === t.destination_account_id);
            if (destAccount) {
              const key = `${t.date}|${t.destination_account_id}`;
              dailyAccountBalances.set(key, {
                date: t.date,
                accountId: t.destination_account_id,
                accountName: destAccount.name,
                balance: newDestBalance,
              });
            }
          }

          // Mark this transfer and its pair as processed
          processedTransfers.add(t.id);
          if (t.transfer_pair_id) {
            processedTransfers.add(t.transfer_pair_id);
          }
        } else {
          const currentBalance = accountBalances.get(t.account_id) || 0;
          const change = t.type === "receita" ? Number(t.amount) : -Number(t.amount);
          const newBalance = currentBalance + change;
          accountBalances.set(t.account_id, newBalance);

          // Update daily balance for this account (overwrites previous value for same day)
          const account = accountsData?.find(a => a.id === t.account_id);
          if (account) {
            const key = `${t.date}|${t.account_id}`;
            dailyAccountBalances.set(key, {
              date: t.date,
              accountId: t.account_id,
              accountName: account.name,
              balance: newBalance,
            });
          }
        }
      });

      // Convert map to array and apply display filter (only account filter)
      let dailyBalancesList = Array.from(dailyAccountBalances.values());
      
      // Apply account filter for display only (balance already considers ALL transactions)
      if (selectedAccounts.length > 0) {
        dailyBalancesList = dailyBalancesList.filter(item => 
          selectedAccounts.includes(item.accountId)
        );
      }

      // Apply date filters for display
      if (startDate) {
        dailyBalancesList = dailyBalancesList.filter(item => item.date >= startDate);
      }
      if (endDate) {
        dailyBalancesList = dailyBalancesList.filter(item => item.date <= endDate);
      }

      // Sort by date descending (most recent first)
      dailyBalancesList.sort((a, b) => b.date.localeCompare(a.date));

      // Map to DailyBalance format
      setDailyBalances(dailyBalancesList.map(item => ({
        date: item.date,
        account_name: item.accountName,
        balance: item.balance,
      })));

      // Fetch budgets for the selected month
      const monthStart = selectedMonth + "-01";
      const { data: budgetsData } = await supabase
        .from("budgets")
        .select("*")
        .eq("user_id", user.id)
        .eq("month", monthStart);

      const { data: categoriesData } = await supabase
        .from("categories")
        .select("id, name, emoji")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      setCategories(categoriesData || []);

      const { data: subcategoriesData } = await supabase
        .from("subcategories")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      setSubcategories(subcategoriesData || []);

      // Calculate balance per category for the selected month (income - expenses)
      const categoryBalances = new Map<string, number>();
      
      filteredTransactions
        .filter(t => t.date.startsWith(selectedMonth) && t.type !== "transferencia")
        .forEach(t => {
          if (t.category_id) {
            const current = categoryBalances.get(t.category_id) || 0;
            if (t.type === "receita") {
              categoryBalances.set(t.category_id, current + Number(t.amount));
            } else if (t.type === "despesa") {
              categoryBalances.set(t.category_id, current - Number(t.amount));
            }
          }
        });

      const budgetsWithBalance = budgetsData?.map(b => {
        const category = categoriesData?.find(c => c.id === b.category_id);
        const balance = categoryBalances.get(b.category_id) || 0;
        
        return {
          id: b.id,
          category_id: b.category_id,
          category_name: category?.name || "N/A",
          amount: Number(b.amount),
          balance,
          month: b.month,
        };
      }) || [];

      setBudgets(budgetsWithBalance);
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

      if (editingBudget) {
        const { error } = await supabase
          .from("budgets")
          .update({
            category_id: formData.category_id,
            amount: Number(formData.amount),
            month: formData.month + "-01",
          })
          .eq("id", editingBudget.id);

        if (error) throw error;

        toast({
          title: "Orçamento atualizado",
          description: "O orçamento foi atualizado com sucesso.",
        });
      } else {
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
      }

      setOpen(false);
      setEditingBudget(null);
      setFormData({
        category_id: "",
        amount: "",
        month: new Date().toISOString().slice(0, 7),
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar orçamento",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este orçamento?")) return;

    try {
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Orçamento excluído",
        description: "O orçamento foi excluído com sucesso.",
      });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir orçamento",
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
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Relatórios</h2>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Visualize saldos mensais, acumulados e conciliação bancária
          </p>
        </div>

        {/* Filtros Globais */}
        <Card className="bg-gradient-card">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
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
                <MultiSelect
                  options={accounts.map(acc => ({ label: acc.name, value: acc.id }))}
                  selected={selectedAccounts}
                  onChange={setSelectedAccounts}
                  placeholder="Todas as contas"
                />
              </div>

              <div>
                <Label htmlFor="category-filter">Categoria</Label>
                <MultiSelect
                  options={categories.map(cat => ({ label: cat.name, value: cat.id, emoji: cat.emoji }))}
                  selected={selectedCategories}
                  onChange={setSelectedCategories}
                  placeholder="Todas as categorias"
                />
              </div>

              <div>
                <Label htmlFor="subcategory-filter">Subcategoria</Label>
                <MultiSelect
                  options={subcategories
                    .filter(sub => selectedCategories.length === 0 || selectedCategories.includes(sub.category_id))
                    .map(sub => ({ label: sub.name, value: sub.id }))}
                  selected={selectedSubcategories}
                  onChange={setSelectedSubcategories}
                  placeholder="Todas as subcategorias"
                />
              </div>

              <div>
                <Label htmlFor="tags-filter">Tags</Label>
                <MultiSelect
                  options={tags.map(tag => ({ label: tag.name, value: tag.id }))}
                  selected={selectedTags}
                  onChange={setSelectedTags}
                  placeholder="Todas as tags"
                />
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setSelectedAccounts([]);
                    setSelectedCategories([]);
                    setSelectedSubcategories([]);
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
            <TabsTrigger value="dashboards">Dashboards</TabsTrigger>
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
              <Dialog open={open} onOpenChange={(isOpen) => {
                setOpen(isOpen);
                if (!isOpen) {
                  setEditingBudget(null);
                  setFormData({
                    category_id: "",
                    amount: "",
                    month: new Date().toISOString().slice(0, 7),
                  });
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Target className="h-4 w-4" />
                    Novo Orçamento
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingBudget ? "Editar Orçamento" : "Novo Orçamento"}
                    </DialogTitle>
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
                      <Label htmlFor="budget-month">Mês</Label>
                      <Input
                        id="budget-month"
                        type="month"
                        value={formData.month}
                        onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="amount">Meta de Saldo</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0.00"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Valor positivo = meta de economia | Valor negativo = limite de déficit
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1">
                        {editingBudget ? "Atualizar" : "Criar"}
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
                  const target = budget.amount;
                  const balance = budget.balance;
                  const percentage = target !== 0 ? (balance / Math.abs(target)) * 100 : 0;
                  const isPositiveTarget = target >= 0;
                  const isOnTrack = isPositiveTarget ? balance >= target : balance >= target;
                  
                  return (
                    <Card key={budget.id} className="bg-gradient-card hover:shadow-lg transition-all">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{budget.category_name}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingBudget(budget);
                                setFormData({
                                  category_id: budget.category_id,
                                  amount: budget.amount.toString(),
                                  month: budget.month.slice(0, 7),
                                });
                                setOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDeleteBudget(budget.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {isPositiveTarget ? "Saldo Atual" : "Déficit Atual"}
                              </p>
                              <p className={`text-2xl font-bold ${isOnTrack ? "text-success" : "text-destructive"}`}>
                                {formatCurrency(balance)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Meta</p>
                              <p className="text-2xl font-bold">{formatCurrency(target)}</p>
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Progresso</span>
                              <span className={`font-medium ${isOnTrack ? "text-success" : "text-destructive"}`}>
                                {percentage.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${isOnTrack ? "bg-success" : "bg-destructive"}`}
                                style={{ width: `${Math.min(Math.abs(percentage), 100)}%` }}
                              />
                            </div>
                          </div>

                          {!isOnTrack && (
                            <p className="text-sm text-destructive font-medium">
                              {isPositiveTarget 
                                ? `Faltam ${formatCurrency(target - balance)} para atingir a meta`
                                : `Você excedeu o déficit em ${formatCurrency(Math.abs(balance - target))}`
                              }
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="dashboards" className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Saldo Total</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(
                          accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0)
                        )}
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-success" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Receitas do Mês</p>
                      <p className="text-2xl font-bold text-success">
                        {formatCurrency(
                          monthlyData.find(m => m.month === selectedMonth)?.income || 0
                        )}
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-success" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Despesas do Mês</p>
                      <p className="text-2xl font-bold text-destructive">
                        {formatCurrency(
                          monthlyData.find(m => m.month === selectedMonth)?.expense || 0
                        )}
                      </p>
                    </div>
                    <TrendingDown className="h-8 w-8 text-destructive" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Taxa de Poupança</p>
                      <p className="text-2xl font-bold">
                        {(() => {
                          const currentMonth = monthlyData.find(m => m.month === selectedMonth);
                          const savingsRate = currentMonth?.income 
                            ? ((currentMonth.income - currentMonth.expense) / currentMonth.income) * 100
                            : 0;
                          return `${savingsRate.toFixed(1)}%`;
                        })()}
                      </p>
                    </div>
                    <Target className="h-8 w-8 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Evolução Patrimonial */}
              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle>Evolução do Saldo</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={monthlyData.slice().reverse()}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month" 
                        tickFormatter={(value) => {
                          const date = new Date(value + "-01");
                          return date.toLocaleDateString("pt-BR", { month: "short" });
                        }}
                        className="text-xs"
                      />
                      <YAxis 
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                        className="text-xs"
                      />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => {
                          const date = new Date(label + "-01");
                          return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="balance" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        name="Saldo"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Receitas vs Despesas */}
              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle>Receitas vs Despesas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyData.slice().reverse()}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month"
                        tickFormatter={(value) => {
                          const date = new Date(value + "-01");
                          return date.toLocaleDateString("pt-BR", { month: "short" });
                        }}
                        className="text-xs"
                      />
                      <YAxis 
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                        className="text-xs"
                      />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => {
                          const date = new Date(label + "-01");
                          return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                        }}
                      />
                      <Legend />
                      <Bar dataKey="income" fill="hsl(var(--success))" name="Receitas" />
                      <Bar dataKey="expense" fill="hsl(var(--destructive))" name="Despesas" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Distribuição por Categoria */}
              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle>Despesas por Categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={(() => {
                          const categoryExpenses = new Map<string, number>();
                          
                          // Calcular despesas por categoria do mês selecionado
                          budgets.forEach(b => {
                            const expense = Math.abs(Math.min(b.balance, 0));
                            if (expense > 0) {
                              categoryExpenses.set(b.category_name, expense);
                            }
                          });

                          const chartData = Array.from(categoryExpenses.entries())
                            .map(([name, value]) => ({ name, value }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 6);

                          return chartData.length > 0 ? chartData : [{ name: "Sem dados", value: 0 }];
                        })()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="hsl(var(--primary))"
                        dataKey="value"
                      >
                        {budgets.map((_, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={`hsl(${(index * 360) / Math.max(budgets.length, 1)}, 70%, 50%)`} 
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Comparativo Trimestral */}
              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle>Tendência Mensal</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {monthlyData.slice(0, 6).map((data, index) => {
                      const previousMonth = monthlyData[index + 1];
                      const change = previousMonth 
                        ? ((data.balance - previousMonth.balance) / Math.abs(previousMonth.balance || 1)) * 100
                        : 0;
                      
                      return (
                        <div key={data.month} className="flex items-center justify-between p-3 border rounded-lg border-border/50">
                          <div className="flex-1">
                            <p className="font-medium">
                              {new Date(data.month + "-01").toLocaleDateString("pt-BR", { 
                                month: "long", 
                                year: "numeric" 
                              })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Saldo: {formatCurrency(data.balance)}
                            </p>
                          </div>
                          {previousMonth && (
                            <div className={`flex items-center gap-1 ${change >= 0 ? "text-success" : "text-destructive"}`}>
                              {change >= 0 ? (
                                <TrendingUp className="h-4 w-4" />
                              ) : (
                                <TrendingDown className="h-4 w-4" />
                              )}
                              <span className="text-sm font-medium">
                                {Math.abs(change).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Reports;
