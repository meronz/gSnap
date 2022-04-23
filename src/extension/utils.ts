export class ExtendedSet<T> extends Set<T> {
    public intersect(other: Set<T>): ExtendedSet<T> {
        return new ExtendedSet(
            [...this].filter(x => other.has(x))
        );
    }
}