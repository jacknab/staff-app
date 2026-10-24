/**
 * Catalog → Products: retail items the business sells (name, brand, price, how many in stock), as on the Certxa
 * website.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { CatalogScreen, Empty, ErrorLine, Field, List, Loading, Pair, QuietButton, Row, SaveButton, errorText, money } from '@/components/catalog/CatalogKit';
import { api } from '@/lib/live-api';

type Product = { id: number; name: string; brand: string; price: number; stock: number };
type Draft = { id: number; name: string; brand: string; price: string; stock: string };

export default function ProductsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await api.get<any[]>('/api/products');
      setRows((Array.isArray(list) ? list : []).map((row) => ({
        id: Number(row.id), name: String(row.name ?? ''), brand: String(row.brand ?? ''), price: Number(row.price) || 0,
        stock: Number(row.stock) || 0,
      })).sort((a, b) => a.name.localeCompare(b.name)));
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load your products.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    const price = Number(draft.price);
    const stock = Number.parseInt(draft.stock || '0', 10);
    if (!name) return setError('Enter the name of the product.');
    if (!draft.price || !Number.isFinite(price) || price < 0) return setError('Enter the price, for example 24 or 24.99.');
    if (!Number.isInteger(stock) || stock < 0) return setError('Enter how many you have in stock.');
    setSaving(true); setError('');
    try {
      const body = { name, brand: draft.brand.trim() || null, price: price.toFixed(2), stock };
      if (draft.id > 0) await api.patch(`/api/products/${draft.id}`, body);
      else await api.post('/api/products', body);
      setDraft(null);
      await load();
    } catch (cause) { setError(errorText(cause, 'Could not save the product.')); }
    finally { setSaving(false); }
  };

  const remove = (row: Product) => {
    Alert.alert('Remove this product?', `${row.name} will be removed from your products.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.del(`/api/products/${row.id}`); setDraft(null); await load(); }
        catch (cause) { setError(errorText(cause, 'Could not remove the product.')); }
      } },
    ]);
  };

  const editing = draft && draft.id > 0 ? rows.find((row) => row.id === draft.id) : undefined;

  return (
    <CatalogScreen
      title={draft ? (draft.id > 0 ? 'Edit product' : 'New product') : 'Products'}
      onBack={() => (draft ? (setDraft(null), setError('')) : router.back())}
      onAdd={draft ? undefined : () => { setError(''); setDraft({ id: 0, name: '', brand: '', price: '', stock: '' }); }}
      addLabel="Add a product"
      testID="products"
    >
      {draft ? (
        <>
          <Field label="Product name" testID="product-name" autoCapitalize="words" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, Cuticle oil" />
          <Field label="Brand" testID="product-brand" autoCapitalize="words" value={draft.brand} onChangeText={(brand) => setDraft({ ...draft, brand })} placeholder="Optional" />
          <Pair>
            <Field label="Price ($)" testID="product-price" keyboardType="decimal-pad" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price: price.replace(/[^\d.]/g, '') })} placeholder="24.99" />
            <Field label="In stock" testID="product-stock" keyboardType="number-pad" value={draft.stock} onChangeText={(stock) => setDraft({ ...draft, stock: stock.replace(/\D/g, '') })} placeholder="10" />
          </Pair>
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="product-save" />
          {editing ? <QuietButton destructive disabled={saving} label="Remove product" onPress={() => remove(editing)} testID="product-remove" /> : null}
        </>
      ) : loading ? <Loading /> : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {rows.length === 0 && !error ? <Empty>You have no products yet. Tap + to add the first one.</Empty> : null}
          <List>
            {rows.map((row) => (
              <Row key={row.id} testID={`product-${row.id}`} title={row.name} hint={`${row.brand ? `${row.brand} · ` : ''}${row.stock} in stock`} right={money(row.price)}
                onPress={() => { setError(''); setDraft({ id: row.id, name: row.name, brand: row.brand, price: row.price.toFixed(2), stock: String(row.stock) }); }} />
            ))}
          </List>
        </>
      )}
    </CatalogScreen>
  );
}
