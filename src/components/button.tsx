


export default function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <button onClick={onPress} className="bg-blue-500 text-white p-2 rounded">
      {title}
    </button>
  );
}