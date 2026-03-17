import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, Filter, X, Clock, CheckCircle2 } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import TransactionForm from "@/components/TransactionForm";
import TransactionImport from "@/components/TransactionImport";

type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: string;
  date: string;
  account_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  observations: string | null;
  destination_account_id: string | null;
  transfer_pair_id: string | null;
  created_at: string;
  status: string;
  tags?: Tag[];
  isTransferCredit?: boolean;
};

type Account = {
  id: string;
  name: string;
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

type Tag = {
  id: string;
  name: string;
  color: string;
};

const Transactions = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("todos");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    type: "despesa",
    date: new Date().toISOString().split('T')[0],
    account_id: "",
    category_id: "",
    subcategory_id: "",
    observations: "",
    tag_ids: [] as string[],
    destination_account_id: "",
    status: "pendente",
  });

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchData();
  }, [selectedAccounts, selectedCategories, selectedSubcategories, selectedTags, startDate, endDate, selectedStatus]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const fetchData = async () => {
    try {
      let transQuery = supabase
        .from("transactions")
        .select("*, transfer_pair_id, created_at, status")
        .order("date", { ascending: false });

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

      if (selectedStatus !== "todos") {
        transQuery = transQuery.eq("status", selectedStatus);
      }

      const [transactionsRes, accountsRes, categoriesRes, subcategoriesRes, tagsRes, transactionTagsRes] = await Promise.all([
        transQuery,
        supabase.from("accounts").select("id, name").order("name", { ascending: true }),
        supabase.from("categories").select("id, name, emoji").order("name", { ascending: true }),
        supabase.from("subcategories").select("id, name, category_id").order("name", { ascending: true }),
        supabase.from("tags").select("id, name, color").order("name", { ascending: true }),
        supabase.from("transaction_tags").select("transaction_id, tag_id"),
      ]);

      if (transactionsRes.error) throw transactionsRes.error;
      if (accountsRes.error) throw accountsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (subcategoriesRes.error) throw subcategoriesRes.error;
      if (tagsRes.error) throw tagsRes.error;

      let transactionsWithTags: Transaction[] = (transactionsRes.data || []).map(transaction => {
        const transactionTags = (transactionTagsRes.data || [])
          .filter(tt => tt.transaction_id === transaction.id)
          .map(tt => (tagsRes.data || []).find(tag => tag.id === tt.tag_id))
          .filter(tag => tag !== undefined) as Tag[];
        
        return {
          ...transaction,
          status: transaction.status || 'realizado',
          tags: transactionTags,
          isTransferCredit: false
        } as Transaction;
      });

      const transactionMap = new Map<string, typeof transactionsWithTags[0]>();
      transactionsWithTags.forEach(t => {
        transactionMap.set(t.id, t);
      });

      const processedTransfers = new Set<string>();

      transactionsWithTags = transactionsWithTags.filter(transaction => {
        if (transaction.type === "transferencia" && transaction.transfer_pair_id) {
          if (processedTransfers.has(transaction.id)) {
            return false;
          }
          
          const pairTransaction = transactionMap.get(transaction.transfer_pair_id);
          
          if (pairTransaction) {
            const thisCreatedAt = new Date(transaction.created_at).getTime();
            const pairCreatedAt = new Date(pairTransaction.created_at).getTime();
            transaction.isTransferCredit = thisCreatedAt > pairCreatedAt;
          }
          
          if (selectedAccounts.length > 0 && pairTransaction) {
            const thisAccountInFilter = selectedAccounts.includes(transaction.account_id);
            const pairAccountInFilter = selectedAccounts.includes(pairTransaction.account_id);
            
            if (thisAccountInFilter && pairAccountInFilter) {
              const thisCreatedAt = new Date(transaction.created_at).getTime();
              const pairCreatedAt = new Date(pairTransaction.created_at).getTime();
              
              if (thisCreatedAt > pairCreatedAt) {
                processedTransfers.add(transaction.id);
                processedTransfers.add(transaction.transfer_pair_id);
                return false;
              }
            }
            else if (!thisAccountInFilter && pairAccountInFilter) {
              processedTransfers.add(transaction.id);
              return false;
            }
            else if (thisAccountInFilter && !pairAccountInFilter) {
              processedTransfers.add(transaction.id);
              processedTransfers.add(transaction.transfer_pair_id);
              return true;
            }
          }
          else if (pairTransaction) {
            const thisCreatedAt = new Date(transaction.created_at).getTime();
            const pairCreatedAt = new Date(pairTransaction.created_at).getTime();
            
            if (thisCreatedAt > pairCreatedAt) {
              processedTransfers.add(transaction.id);
              processedTransfers.add(transaction.transfer_pair_id);
              return false;
            }
          }
          
          processedTransfers.add(transaction.id);
          if (transaction.transfer_pair_id) {
            processedTransfers.add(transaction.transfer_pair_id);
          }
        }
        return true;
      });

      if (selectedTags.length > 0) {
        transactionsWithTags = transactionsWithTags.filter(transaction =>
          transaction.tags?.some(tag => selectedTags.includes(tag.id))
        );
      }

      setTransactions(transactionsWithTags);
      setAccounts(accountsRes.data || []);
      setCategories(categoriesRes.data || []);
      setSubcategories(subcategoriesRes.data || []);
      setTags(tagsRes.data || []);
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

  const handleToggleStatus = async (transaction: Transaction) => {
    const newStatus = transaction.status === 'pendente' ? 'realizado' : 'pendente';
    try {
      // If transfer, also update the pair
      const updates: Promise<any>[] = [
        supabase.from("transactions").update({ status: newStatus }).eq("id", transaction.id)
      ];
      if (transaction.type === "transferencia" && transaction.transfer_pair_id) {
        updates.push(
          supabase.from("transactions").update({ status: newStatus }).eq("id", transaction.transfer_pair_id)
        );
      }
      const results = await Promise.all(updates);
      for (const r of results) {
        if (r.error) throw r.error;
      }
      setTransactions(prev =>
        prev.map(t =>
          t.id === transaction.id || t.id === transaction.transfer_pair_id
            ? { ...t, status: newStatus }
            : t
        )
      );
    } catch (error: any) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (editingId) {
        const transactionData = {
          description: formData.description,
          amount: Number(formData.amount),
          type: formData.type,
          date: formData.date,
          account_id: formData.account_id,
          category_id: formData.category_id || null,
          subcategory_id: formData.subcategory_id || null,
          observations: formData.observations || null,
          destination_account_id: formData.destination_account_id || null,
          status: formData.status,
          user_id: user.id,
        };

        const { data: currentTransaction } = await supabase
          .from("transactions")
          .select("type, transfer_pair_id")
          .eq("id", editingId)
          .single();

        const { error } = await supabase
          .from("transactions")
          .update(transactionData)
          .eq("id", editingId);
        
        if (error) throw error;

        if (formData.type === "transferencia" && currentTransaction?.transfer_pair_id) {
          const pairData = {
            description: formData.description,
            amount: Number(formData.amount),
            type: "transferencia",
            date: formData.date,
            account_id: formData.destination_account_id,
            category_id: null,
            subcategory_id: null,
            observations: formData.observations || null,
            destination_account_id: formData.account_id,
            status: formData.status,
            user_id: user.id,
          };

          await supabase
            .from("transactions")
            .update(pairData)
            .eq("id", currentTransaction.transfer_pair_id);
        }

        await supabase.from("transaction_tags").delete().eq("transaction_id", editingId);

        if (formData.tag_ids.length > 0) {
          const tagRecords = formData.tag_ids.map(tag_id => ({ transaction_id: editingId, tag_id }));
          const { error: tagError } = await supabase.from("transaction_tags").insert(tagRecords);
          if (tagError) throw tagError;
        }
        
        toast({ title: "Transação atualizada", description: "A transação foi atualizada com sucesso." });
      } else {
        if (formData.type === "transferencia") {
          const debitData = {
            description: formData.description,
            amount: Number(formData.amount),
            type: "transferencia",
            date: formData.date,
            account_id: formData.account_id,
            category_id: null,
            subcategory_id: null,
            observations: formData.observations || null,
            destination_account_id: formData.destination_account_id,
            status: formData.status,
            user_id: user.id,
          };

          const { data: debitTransaction, error: debitError } = await supabase
            .from("transactions").insert([debitData]).select().single();
          if (debitError) throw debitError;

          await new Promise(resolve => setTimeout(resolve, 10));

          const creditData = {
            description: formData.description,
            amount: Number(formData.amount),
            type: "transferencia",
            date: formData.date,
            account_id: formData.destination_account_id,
            category_id: null,
            subcategory_id: null,
            observations: formData.observations || null,
            destination_account_id: formData.account_id,
            status: formData.status,
            user_id: user.id,
            transfer_pair_id: debitTransaction.id,
          };

          const { data: creditTransaction, error: creditError } = await supabase
            .from("transactions").insert([creditData]).select().single();
          if (creditError) throw creditError;

          await supabase.from("transactions").update({ transfer_pair_id: creditTransaction.id }).eq("id", debitTransaction.id);

          if (formData.tag_ids.length > 0) {
            const tagRecords = [
              ...formData.tag_ids.map(tag_id => ({ transaction_id: debitTransaction.id, tag_id })),
              ...formData.tag_ids.map(tag_id => ({ transaction_id: creditTransaction.id, tag_id })),
            ];
            const { error: tagError } = await supabase.from("transaction_tags").insert(tagRecords);
            if (tagError) throw tagError;
          }
        } else {
          const transactionData = {
            description: formData.description,
            amount: Number(formData.amount),
            type: formData.type,
            date: formData.date,
            account_id: formData.account_id,
            category_id: formData.category_id || null,
            subcategory_id: formData.subcategory_id || null,
            observations: formData.observations || null,
            destination_account_id: null,
            status: formData.status,
            user_id: user.id,
          };

          const { data: newTransaction, error } = await supabase
            .from("transactions").insert([transactionData]).select().single();
          if (error) throw error;

          if (formData.tag_ids.length > 0 && newTransaction) {
            const tagRecords = formData.tag_ids.map(tag_id => ({ transaction_id: newTransaction.id, tag_id }));
            const { error: tagError } = await supabase.from("transaction_tags").insert(tagRecords);
            if (tagError) throw tagError;
          }
        }
        
        toast({ title: "Transação criada", description: "A transação foi criada com sucesso." });
      }

      setOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro ao salvar transação", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setFormData({
      description: transaction.description,
      amount: transaction.amount.toString(),
      type: transaction.type,
      date: transaction.date,
      account_id: transaction.account_id,
      category_id: transaction.category_id || "",
      subcategory_id: transaction.subcategory_id || "",
      observations: transaction.observations || "",
      tag_ids: transaction.tags?.map(t => t.id) || [],
      destination_account_id: transaction.destination_account_id || "",
      status: transaction.status || "pendente",
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta transação?")) return;

    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Transação excluída", description: "A transação foi excluída com sucesso." });
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro ao excluir transação", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      description: "",
      amount: "",
      type: "despesa",
      date: new Date().toISOString().split('T')[0],
      account_id: "",
      category_id: "",
      subcategory_id: "",
      observations: "",
      tag_ids: [],
      destination_account_id: "",
      status: "pendente",
    });
    setEditingId(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || "N/A";
  const getCategoryName = (id: string | null) => id ? categories.find(c => c.id === id)?.name || "N/A" : "N/A";
  const getCategoryEmoji = (id: string | null) => id ? categories.find(c => c.id === id)?.emoji || "" : "";

  const filteredSubcategories = subcategories.filter(s => s.category_id === formData.category_id);

  const activeFilterCount = selectedAccounts.length + selectedCategories.length + selectedSubcategories.length + selectedTags.length + (startDate ? 1 : 0) + (endDate ? 1 : 0) + (selectedStatus !== "todos" ? 1 : 0);

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
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Transações</h2>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Gerencie suas receitas e despesas
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              className="gap-2 flex-1 sm:flex-initial"
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground rounded-full text-xs w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            <TransactionImport
              accounts={accounts}
              categories={categories}
              onImportComplete={fetchData}
            />
            
            <Dialog open={open} onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (!isOpen) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="gap-2 flex-1 sm:flex-initial">
                  <Plus className="h-4 w-4" />
                  <span className="sm:inline">Nova Transação</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingId ? "Editar Transação" : "Nova Transação"}
                  </DialogTitle>
                </DialogHeader>
                <TransactionForm
                  formData={formData}
                  setFormData={setFormData}
                  accounts={accounts}
                  categories={categories}
                  subcategories={subcategories}
                  tags={tags}
                  filteredSubcategories={filteredSubcategories}
                  onSubmit={handleSubmit}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filtros colapsáveis */}
        {showFilters && (
          <Card className="bg-gradient-card">
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8 gap-3">
                <div>
                  <Label className="text-xs">Data Início</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">Data Fim</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">Status</Label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="h-8 text-sm w-full border border-input rounded-md bg-background px-2"
                  >
                    <option value="todos">Todos</option>
                    <option value="pendente">Pendente</option>
                    <option value="realizado">Realizado</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs">Conta</Label>
                  <MultiSelect
                    options={accounts.map(acc => ({ label: acc.name, value: acc.id }))}
                    selected={selectedAccounts}
                    onChange={setSelectedAccounts}
                    placeholder="Todas as contas"
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">Categoria</Label>
                  <MultiSelect
                    options={categories.map(cat => ({ label: cat.name, value: cat.id, emoji: cat.emoji }))}
                    selected={selectedCategories}
                    onChange={setSelectedCategories}
                    placeholder="Todas as categorias"
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">Subcategoria</Label>
                  <MultiSelect
                    options={subcategories
                      .filter(sub => selectedCategories.length === 0 || selectedCategories.includes(sub.category_id))
                      .map(sub => ({ label: sub.name, value: sub.id }))}
                    selected={selectedSubcategories}
                    onChange={setSelectedSubcategories}
                    placeholder="Todas as subcategorias"
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">Tags</Label>
                  <MultiSelect
                    options={tags.map(tag => ({ label: tag.name, value: tag.id }))}
                    selected={selectedTags}
                    onChange={setSelectedTags}
                    placeholder="Todas as tags"
                    className="h-8 text-sm"
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    className="w-full h-8 text-sm gap-1"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                      setSelectedAccounts([]);
                      setSelectedCategories([]);
                      setSelectedSubcategories([]);
                      setSelectedTags([]);
                      setSelectedStatus("todos");
                    }}
                  >
                    <X className="h-3 w-3" />
                    Limpar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-1">
          {transactions.length === 0 ? (
            <Card className="bg-gradient-card">
              <CardContent className="py-12 text-center">
                <ArrowUpCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nenhuma transação cadastrada ainda.
                </p>
              </CardContent>
            </Card>
          ) : (
            transactions.map((transaction) => (
              <div
                key={transaction.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                  transaction.status === 'pendente'
                    ? 'bg-muted/20 border-dashed border-border/60 opacity-80'
                    : 'bg-card border-border hover:bg-muted/40'
                }`}
              >
                {/* Status toggle */}
                <button
                  onClick={() => handleToggleStatus(transaction)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  title={transaction.status === 'pendente' ? 'Marcar como realizado' : 'Marcar como pendente'}
                >
                  {transaction.status === 'pendente' ? (
                    <Clock className="h-4 w-4 text-warning" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  )}
                </button>

                {/* Ícone tipo */}
                <div className="flex-shrink-0">
                  {transaction.type === "receita" ? (
                    <ArrowUpCircle className="h-5 w-5 text-success" />
                  ) : transaction.type === "transferencia" ? (
                    <div className="flex items-center">
                      <ArrowDownCircle className="h-4 w-4 text-primary" />
                      <ArrowUpCircle className="h-4 w-4 text-primary -ml-1" />
                    </div>
                  ) : (
                    <ArrowDownCircle className="h-5 w-5 text-destructive" />
                  )}
                </div>

                {/* Data */}
                <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
                  {transaction.date.split('-').reverse().join('/')}
                </span>

                {/* Descrição + tags */}
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{transaction.description}</span>
                  {transaction.status === 'pendente' && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 border-warning text-warning">
                      Pendente
                    </Badge>
                  )}
                  {transaction.tags && transaction.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {transaction.tags.map(tag => (
                        <Badge
                          key={tag.id}
                          style={{ backgroundColor: tag.color, color: '#fff' }}
                          className="text-xs px-1.5 py-0"
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Conta / categoria */}
                <div className="hidden md:flex flex-col items-end text-xs text-muted-foreground flex-shrink-0 max-w-[160px]">
                  {transaction.type === "transferencia" ? (
                    <span className="truncate">
                      {transaction.isTransferCredit
                        ? getAccountName(transaction.destination_account_id || "")
                        : getAccountName(transaction.account_id)}
                      {" → "}
                      {transaction.isTransferCredit
                        ? getAccountName(transaction.account_id)
                        : getAccountName(transaction.destination_account_id || "")}
                    </span>
                  ) : (
                    <>
                      <span className="truncate">{getAccountName(transaction.account_id)}</span>
                      <span className="truncate flex items-center gap-0.5">
                        {getCategoryEmoji(transaction.category_id) && (
                          <span>{getCategoryEmoji(transaction.category_id)}</span>
                        )}
                        {getCategoryName(transaction.category_id)}
                      </span>
                    </>
                  )}
                </div>

                {/* Valor */}
                <span className={`text-sm font-semibold flex-shrink-0 w-28 text-right ${
                  transaction.type === "receita" ? "text-success" :
                  transaction.type === "transferencia" ? "text-primary" :
                  "text-destructive"
                }`}>
                  {transaction.type === "receita" ? "+" : transaction.type === "transferencia" ? "" : "-"}
                  {formatCurrency(transaction.amount)}
                </span>

                {/* Ações */}
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleEdit(transaction)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleDelete(transaction.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Transactions;
