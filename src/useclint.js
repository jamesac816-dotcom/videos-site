import { supabase } from '../supabaseClient'

export default function Contas() {
  const [contas, setContas] = useState([])

  useEffect(() => {
    async function fetchContas() {
      const { data, error } = await supabase.from('contas').select('*')
      if (data) setContas(data)
      if (error) console.error(error)
    }
    fetchContas()
  }, [])

  return <ul>{contas.map(c => <li key={c.id}>{c.descricao}</li>)}</ul>
}