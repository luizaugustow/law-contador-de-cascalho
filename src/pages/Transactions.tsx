import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { MultiSelect, Option } from "@/components/ui/multi-select";
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
  tags?: Tag[];
  isTransferCredit?: boolean; // Flag para indicar se é o lado crédito da transferência
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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
  });

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchData();
  }, [selectedAccounts, selectedCategories, selectedSubcategories, selectedTags, startDate, endDate]);

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
        .select("*, transfer_pair_id, created_at")
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

      // Mapear tags para transações
      let transactionsWithTags: Transaction[] = (transactionsRes.data || []).map(transaction => {
        const transactionTags = (transactionTagsRes.data || [])
          .filter(tt => tt.transaction_id === transaction.id)
          .map(tt => (tagsRes.data || []).find(tag => tag.id === tt.tag_id))
          .filter(tag => tag !== undefined) as Tag[];
        
        return {
          ...transaction,
          tags: transactionTags,
          isTransferCredit: false
        } as Transaction;
      });

      // Filtrar transferências duplicadas (mostrar apenas o lado primário - o débito original)
      // Criar mapa para encontrar pares
      const transactionMap = new Map<string, typeof transactionsWithTags[0]>();
      transactionsWithTags.forEach(t => {
        transactionMap.set(t.id, t);
      });

      const processedTransfers = new Set<string>();

      transactionsWithTags = transactionsWithTags.filter(transaction => {
        if (transaction.type === "transferencia" && transaction.transfer_pair_id) {
          // Se já processamos este par, pular
          if (processedTransfers.has(transaction.id)) {
            return false;
          }
          
          const pairTransaction = transactionMap.get(transaction.transfer_pair_id);
          
          // Determinar se esta transação é o lado crédito (criada depois)
          if (pairTransaction) {
            const thisCreatedAt = new Date(transaction.created_at).getTime();
            const pairCreatedAt = new Date(pairTransaction.created_at).getTime();
            transaction.isTransferCredit = thisCreatedAt > pairCreatedAt;
          }
          
          // Se tem filtro de contas, mostrar a transação relevante para as contas selecionadas
          if (selectedAccounts.length > 0 && pairTransaction) {
            const thisAccountInFilter = selectedAccounts.includes(transaction.account_id);
            const pairAccountInFilter = selectedAccounts.includes(pairTransaction.account_id);
            
            // Se ambas as contas estão no filtro, mostrar a mais antiga (débito)
            if (thisAccountInFilter && pairAccountInFilter) {
              const thisCreatedAt = new Date(transaction.created_at).getTime();
              const pairCreatedAt = new Date(pairTransaction.created_at).getTime();
              
              if (thisCreatedAt > pairCreatedAt) {
                processedTransfers.add(transaction.id);
                processedTransfers.add(transaction.transfer_pair_id);
                return false;
              }
            }
            // Se apenas a conta par está no filtro, pular esta (a par será mostrada depois)
            else if (!thisAccountInFilter && pairAccountInFilter) {
              processedTransfers.add(transaction.id);
              // NÃO marcar a par como processada - deixar ela aparecer
              return false;
            }
            // Se apenas esta conta está no filtro, mostrar esta
            else if (thisAccountInFilter && !pairAccountInFilter) {
              processedTransfers.add(transaction.id);
              processedTransfers.add(transaction.transfer_pair_id);
              return true;
            }
          }
          // Sem filtro de contas: mostrar sempre a mais antiga (débito original)
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

      // Filtrar por tags selecionadas
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (editingId) {
        // Atualizar transação existente
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
          user_id: user.id,
        };

        // Verificar se é uma transferência para atualizar a transação par
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

        // Se for transferência, atualizar a transação par
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
            user_id: user.id,
          };

          await supabase
            .from("transactions")
            .update(pairData)
            .eq("id", currentTransaction.transfer_pair_id);
        }

        // Deletar tags antigas e inserir novas
        await supabase
          .from("transaction_tags")
          .delete()
          .eq("transaction_id", editingId);

        if (formData.tag_ids.length > 0) {
          const tagRecords = formData.tag_ids.map(tag_id => ({
            transaction_id: editingId,
            tag_id
          }));
          
          const { error: tagError } = await supabase
            .from("transaction_tags")
            .insert(tagRecords);
          
          if (tagError) throw tagError;
        }
        
        toast({
          title: "Transação atualizada",
          description: "A transação foi atualizada com sucesso.",
        });
      } else {
        // Criar nova transação
        if (formData.type === "transferencia") {
          // Criar transação de saída (débito)
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
            user_id: user.id,
          };

          const { data: debitTransaction, error: debitError } = await supabase
            .from("transactions")
            .insert([debitData])
            .select()
            .single();
          
          if (debitError) throw debitError;

          // Pequeno delay para garantir created_at diferente
          await new Promise(resolve => setTimeout(resolve, 10));

          // Criar transação de entrada (crédito)
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
            user_id: user.id,
            transfer_pair_id: debitTransaction.id,
          };

          const { data: creditTransaction, error: creditError } = await supabase
            .from("transactions")
            .insert([creditData])
            .select()
            .single();
          
          if (creditError) throw creditError;

          // Atualizar a transação de débito com o ID da transação de crédito
          await supabase
            .from("transactions")
            .update({ transfer_pair_id: creditTransaction.id })
            .eq("id", debitTransaction.id);

          // Inserir tags em ambas as transações
          if (formData.tag_ids.length > 0) {
            const tagRecords = [
              ...formData.tag_ids.map(tag_id => ({
                transaction_id: debitTransaction.id,
                tag_id
              })),
              ...formData.tag_ids.map(tag_id => ({
                transaction_id: creditTransaction.id,
                tag_id
              }))
            ];
            
            const { error: tagError } = await supabase
              .from("transaction_tags")
              .insert(tagRecords);
            
            if (tagError) throw tagError;
          }
        } else {
          // Criar transação normal (receita ou despesa)
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
            user_id: user.id,
          };

          const { data: newTransaction, error } = await supabase
            .from("transactions")
            .insert([transactionData])
            .select()
            .single();
          
          if (error) throw error;

          // Inserir tags
          if (formData.tag_ids.length > 0 && newTransaction) {
            const tagRecords = formData.tag_ids.map(tag_id => ({
              transaction_id: newTransaction.id,
              tag_id
            }));
            
            const { error: tagError } = await supabase
              .from("transaction_tags")
              .insert(tagRecords);
            
            if (tagError) throw tagError;
          }
        }
        
        toast({
          title: "Transação criada",
          description: "A transação foi criada com sucesso.",
        });
      }

      setOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar transação",
        description: error.message,
        variant: "destructive",
      });
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
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta transação?")) return;

    try {
      // Verificar se é uma transferência para deletar ambas as transações
      const { data: transaction } = await supabase
        .from("transactions")
        .select("transfer_pair_id")
        .eq("id", id)
        .single();

      // Deletar a transação (o CASCADE vai deletar a transação par automaticamente)
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Transação excluída",
        description: "A transação foi excluída com sucesso.",
      });
      
      fetchData();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir transação",
        description: error.message,
        variant: "destructive",
      });
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
    });
    setEditingId(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getAccountName = (id: string) => {
    return accounts.find(a => a.id === id)?.name || "N/A";
  };

  const getCategoryName = (id: string | null) => {
    if (!id) return "N/A";
    return categories.find(c => c.id === id)?.name || "N/A";
  };

  const getCategoryEmoji = (id: string | null) => {
    if (!id) return "";
    return categories.find(c => c.id === id)?.emoji || "";
  };

  const filteredSubcategories = subcategories.filter(s => s.category_id === formData.category_id);

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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Transações</h2>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Gerencie suas receitas e despesas
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
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

        {/* Filtros */}
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

        <div className="space-y-4">
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
              <Card key={transaction.id} className="bg-gradient-card hover:shadow-lg transition-all">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      {transaction.type === "receita" ? (
                        <ArrowUpCircle className="h-8 w-8 text-success flex-shrink-0" />
                      ) : transaction.type === "transferencia" ? (
                        <div className="flex items-center flex-shrink-0">
                          <ArrowDownCircle className="h-6 w-6 text-primary" />
                          <ArrowUpCircle className="h-6 w-6 text-primary -ml-2" />
                        </div>
                      ) : (
                        <ArrowDownCircle className="h-8 w-8 text-destructive flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-base sm:text-lg break-words">{transaction.description}</h3>
                          {transaction.tags && transaction.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {transaction.tags.map(tag => (
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
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-muted-foreground mt-1">
                          <span>{new Date(transaction.date).toLocaleDateString("pt-BR")}</span>
                          <span className="hidden sm:inline">•</span>
                          {transaction.type === "transferencia" ? (
                            <>
                              <span className="break-all">
                                De: {transaction.isTransferCredit 
                                  ? getAccountName(transaction.destination_account_id || "") 
                                  : getAccountName(transaction.account_id)} 
                                → Para: {transaction.isTransferCredit 
                                  ? getAccountName(transaction.account_id) 
                                  : getAccountName(transaction.destination_account_id || "")}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>{getAccountName(transaction.account_id)}</span>
                              <span className="hidden sm:inline">•</span>
                              <span className="flex items-center gap-1">
                                {getCategoryEmoji(transaction.category_id) && (
                                  <span className="text-base">{getCategoryEmoji(transaction.category_id)}</span>
                                )}
                                {getCategoryName(transaction.category_id)}
                              </span>
                            </>
                          )}
                        </div>
                        {transaction.observations && (
                          <p className="text-sm text-muted-foreground mt-2 italic">
                            {transaction.observations}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                      <span className={`text-xl sm:text-2xl font-bold ${
                        transaction.type === "receita" ? "text-success" : 
                        transaction.type === "transferencia" ? "text-primary" : 
                        "text-destructive"
                      }`}>
                        {transaction.type === "receita" ? "+" : transaction.type === "transferencia" ? "" : "-"}
                        {formatCurrency(transaction.amount)}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleEdit(transaction)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDelete(transaction.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Transactions;
